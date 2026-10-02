import { STAFF_INFO } from "./constants";
import { castFromClient } from "./generate";
import { agencyTier, clamp, clientFromCatalog, expectedFee, genreFit } from "./people";
import { addWeeks, cmpDate, scheduleConflict, shootEnd, tryShift } from "./schedule";
import type { ActionResult, BudgetTier, Catalog, Client, GameState, Offer, Project, StaffRole } from "./types";

function clone(state: GameState): GameState {
  return structuredClone(state);
}

export function book(state: GameState, amount: number, label: string): void {
  state.agency.cash = Math.round(state.agency.cash + amount);
  state.ledger.unshift({
    date: { ...state.date },
    label,
    amount: Math.round(amount),
    balance: state.agency.cash,
  });
  if (state.ledger.length > 120) state.ledger.length = 120;
}

export function bumpRep(state: GameState, delta: number): void {
  state.agency.reputation = clamp(state.agency.reputation + delta, 1, 99);
  state.agency.tier = agencyTier(state.agency.reputation);
}

function staffLevel(state: GameState, role: StaffRole): number {
  return state.agency.staff.find((s) => s.role === role)?.level ?? 0;
}

export function actorFit(client: Client, project: Project, fee: number, billing: number, role: Offer["role"]): { score: number; warning?: string } {
  const fit = genreFit(client.preferredGenres, project.genres, client.stats.range);
  let score = 58 + (fit - 50) * 0.45;
  if (client.traits.prestigeVsMoney >= 68 && project.prestige < 48) score -= 24;
  if (client.traits.prestigeVsMoney <= 30 && (project.budgetTier === "micro-indie" || project.budgetTier === "indie") && project.prestige > 70) score -= 10;
  const fair = expectedFee(client.fame, role, project.budgetTier);
  if (client.traits.greed >= 70 && fee < fair * 0.85) score -= 18;
  if (client.traits.ambition >= 75 && (role === "Cameo" || role === "Guest Star" || billing > 3)) score -= 16;
  if (client.nextPreference === "prestige" && project.prestige < 58) score -= 18;
  if (client.nextPreference === "commercial" && (project.budgetTier === "micro-indie" || project.budgetTier === "indie")) score -= 12;
  if (project.directorAcclaim >= 78 && client.traits.prestigeVsMoney >= 50) score += 10;
  if (project.scriptQuality < 42) score -= 8;
  score = Math.round(score);
  if (score < 52) {
    const bits = [];
    if (fit < 45) bits.push(`${project.genres[0]} is outside their comfort`);
    if (client.nextPreference === "prestige" && project.prestige < 58) bits.push("they asked for prestige after the last one");
    if (client.traits.prestigeVsMoney >= 68 && project.prestige < 48) bits.push("this reads as a paycheck, and they are not in a paycheck mood");
    if (client.traits.greed >= 70 && fee < fair * 0.85) bits.push("the quote is light for them");
    if (client.traits.ambition >= 75 && billing > 2) bits.push("the billing is beneath where they think they are");
    return {
      score,
      warning: `${client.name} may refuse ${project.title}. ${bits.join("; ") || "It clashes with what they want right now."} Confirming an override will cost loyalty${score < 38 ? ", and they may still walk" : ""}.`,
    };
  }
  return { score };
}

function betterOfferWarning(state: GameState, offer: Offer): string | undefined {
  const others = state.offers.filter((o) => o.id !== offer.id && o.personId === offer.personId && o.status === "pending");
  const better = others.find((o) => o.fee > offer.fee * 1.12 || o.prestige > offer.prestige + 12);
  if (!better) return undefined;
  const project = state.projects.find((p) => p.id === better.projectId);
  return `A stronger offer is still open: ${project?.title ?? "another project"} at $${better.fee.toLocaleString("en-US")} (prestige ${better.prestige}). Accepting this one does not automatically cancel it, but the dates may collide.`;
}

function fillNpcLater(project: Project): void {
  project.openRole = null;
}

export function acceptOffer(input: GameState, offerId: string, confirm = false): ActionResult {
  const state = clone(input);
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") return { state, ok: false, message: "That offer is no longer open." };
  const project = state.projects.find((p) => p.id === offer.projectId);
  const client = state.clients.find((c) => c.personId === offer.personId && c.agency === "player");
  if (!project || !client) return { state, ok: false, message: "The offer is missing a project or a client." };
  const conflict = scheduleConflict(state, client.personId, project.prepStart, shootEnd(project), project.id);
  if (conflict) return { state, ok: false, message: conflict.message };
  const fit = actorFit(client, project, offer.fee, offer.billing, offer.role);
  const better = betterOfferWarning(state, offer);
  const warning = [fit.warning, better].filter(Boolean).join(" ");
  if (warning && !confirm) return { state: input, ok: false, message: warning, warning };
  if (fit.score < 38) {
    offer.status = "actor_refused";
    client.loyalty = clamp(client.loyalty - 6, 1, 99);
    client.mood = "Unhappy";
    client.overrides += 1;
    fillNpcLater(project);
    state.inbox.unshift({
      id: `in_${state.seq++}`,
      date: { ...state.date },
      kind: "offer",
      title: `${client.name} passed on ${project.title}`,
      body: fit.warning ?? "They refused the job.",
      href: `/actors/${client.personId}`,
      read: false,
    });
    return { state, ok: false, message: `${client.name} refused ${project.title}. Loyalty slipped.` };
  }
  if (fit.warning && confirm) {
    client.loyalty = clamp(client.loyalty - 6, 1, 99);
    client.overrides += 1;
    if (client.mood === "Content" || client.mood === "Thrilled") client.mood = "Uneasy";
  }
  const character = project.openRole?.character ?? "Lead";
  project.cast.push(castFromClient(client, offer.role, offer.billing, offer.fee, offer.backend, character));
  project.cast.sort((a, b) => a.billing - b.billing);
  project.openRole = null;
  project.playerInvolved = true;
  if (offer.perk) project.logline = `${project.logline} Perk: ${offer.perk}.`;
  offer.status = "accepted";
  for (const other of state.offers) {
    if (other.status !== "pending" || other.personId !== client.personId || other.id === offer.id) continue;
    const otherProject = state.projects.find((p) => p.id === other.projectId);
    if (!otherProject) continue;
    const clash = scheduleConflict(state, client.personId, otherProject.prepStart, shootEnd(otherProject), otherProject.id);
    if (clash) {
      other.status = "expired";
      otherProject.openRole = null;
      state.inbox.unshift({
        id: `in_${state.seq++}`,
        date: { ...state.date },
        kind: "offer",
        title: `Passed on ${otherProject.title}`,
        body: `${client.name} is now booked. ${clash.message}`,
        href: "/offers",
        read: false,
      });
    }
  }
  state.lastTurn.push(`${client.name} accepted ${offer.role} in ${project.title}.`);
  return { state, ok: true, message: `${client.name} is attached to ${project.title} as ${offer.role}.` };
}

export function declineOffer(input: GameState, offerId: string): ActionResult {
  const state = clone(input);
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") return { state, ok: false, message: "That offer is no longer open." };
  offer.status = "declined";
  const project = state.projects.find((p) => p.id === offer.projectId);
  if (project) project.openRole = null;
  const client = state.clients.find((c) => c.personId === offer.personId);
  return { state, ok: true, message: `Declined ${project?.title ?? "the offer"}${client ? ` for ${client.name}` : ""}.` };
}

export function counterOffer(
  input: GameState,
  offerId: string,
  counter: { fee?: number; billing?: number; backend?: number; dateShiftWeeks?: number; perk?: string | null },
  confirm = false,
): ActionResult {
  const state = clone(input);
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") return { state, ok: false, message: "That offer is no longer open." };
  const project = state.projects.find((p) => p.id === offer.projectId);
  const client = state.clients.find((c) => c.personId === offer.personId && c.agency === "player");
  if (!project || !client) return { state, ok: false, message: "The offer is missing a project or a client." };
  const fee = Math.round(counter.fee ?? offer.fee);
  const billing = counter.billing ?? offer.billing;
  const backend = counter.backend ?? offer.backend;
  const shift = counter.dateShiftWeeks ?? 0;
  const perk = counter.perk ?? null;
  if (fee > offer.walkAwayFee || backend > offer.walkAwayBackend + 0.1 || billing < offer.minBilling) {
    offer.status = "killed";
    client.studioHeat[offer.studio] = (client.studioHeat[offer.studio] ?? 0) + 2;
    project.openRole = null;
    state.inbox.unshift({
      id: `in_${state.seq++}`,
      date: { ...state.date },
      kind: "offer",
      title: `${offer.studio} walked away`,
      body: `The counter on ${project.title} for ${client.name} cleared their walk-away. They will remember.`,
      href: "/offers",
      read: false,
    });
    return { state, ok: false, message: `${offer.studio} killed the offer. The counter was past their walk-away.` };
  }
  if (shift !== 0) {
    if (!offer.dateFlexible || Math.abs(shift) > 4) {
      return { state, ok: false, message: "Those dates are not movable." };
    }
    if (!tryShift(state, project, shift)) {
      return { state, ok: false, message: "Those dates collide with someone already booked on the project." };
    }
    offer.dateShiftWeeks = shift;
  }
  offer.fee = fee;
  offer.billing = billing;
  offer.backend = Math.round(backend * 10) / 10;
  if (perk && offer.perkAvailable) offer.perk = perk;
  const conflict = scheduleConflict(state, client.personId, project.prepStart, shootEnd(project), project.id);
  if (conflict) return { state, ok: false, message: conflict.message };
  const fit = actorFit(client, project, offer.fee, offer.billing, offer.role);
  const warning = fit.warning;
  if (warning && !confirm) return { state: input, ok: false, message: warning, warning };
  return acceptOffer(state, offerId, true);
}

export function maxCommission(client: Client, reputation: number, poach: boolean): number {
  let max = 9 + client.traits.greed / 12 - reputation / 16;
  if (poach) max -= 1.5;
  if (client.fame === "Icon" || client.fame === "A-list") max -= 2;
  return Math.max(5, Math.min(20, Math.round(max)));
}

export function signClient(
  input: GameState,
  catalog: Catalog,
  personId: number,
  terms: { commission: number; years: number; exclusive: boolean; exitClause: boolean },
): ActionResult {
  const state = clone(input);
  const existing = state.clients.find((c) => c.personId === personId);
  if (existing?.agency === "player" && existing.contract) {
    return { state, ok: false, message: `${existing.name} is already a client.` };
  }
  const person = catalog.actors.find((a) => a.id === personId);
  if (!person && !existing) return { state, ok: false, message: "That actor is not in the cached talent pool." };
  const poach = existing?.agency === "rival";
  const client = existing ?? clientFromCatalog(person!, "player", state.date, null);
  const ceiling = maxCommission(client, state.agency.reputation, Boolean(poach));
  if (terms.commission > ceiling) {
    return {
      state: input,
      ok: false,
      message: `${client.name} won't sign at ${terms.commission}%. Their ceiling right now is about ${ceiling}%.`,
    };
  }
  if (poach) {
    const lawyer = staffLevel(state, "lawyer");
    const defense = (existing?.loyalty ?? 50) + (existing?.contract?.exclusive ? 12 : 0) - state.agency.reputation / 4 - lawyer * 4;
    if (defense > 70 && terms.commission >= ceiling) {
      return { state: input, ok: false, message: `${client.name} stayed at ${existing?.rivalId ?? "their agency"}. The poach did not land.` };
    }
  }
  client.agency = "player";
  client.rivalId = null;
  client.contract = {
    commission: terms.commission,
    start: { ...state.date },
    termYears: Math.max(1, Math.min(5, terms.years)),
    exclusive: terms.exclusive,
    exitClause: terms.exitClause,
  };
  client.loyalty = clamp(client.loyalty + (poach ? -4 : 6), 1, 99);
  if (!existing) state.clients.push(client);
  const approach = state.approaches.find((a) => a.personId === personId && a.status === "pending");
  if (approach) approach.status = "signed";
  bumpRep(state, poach ? 2 : 1);
  state.inbox.unshift({
    id: `in_${state.seq++}`,
    date: { ...state.date },
    kind: "system",
    title: `${client.name} signed`,
    body: `${terms.commission}% for ${terms.years} year${terms.years === 1 ? "" : "s"}${terms.exclusive ? ", exclusive" : ""}.`,
    href: `/actors/${client.personId}`,
    read: false,
  });
  return { state, ok: true, message: `${client.name} is now a client at ${terms.commission}%.` };
}

export function renewContract(input: GameState, personId: number, terms: { commission: number; years: number; exclusive: boolean; exitClause: boolean }): ActionResult {
  const state = clone(input);
  const client = state.clients.find((c) => c.personId === personId && c.agency === "player");
  if (!client) return { state, ok: false, message: "They are not a client." };
  const ceiling = maxCommission(client, state.agency.reputation, false) + (client.loyalty > 70 ? 2 : 0);
  if (terms.commission > ceiling) return { state: input, ok: false, message: `${client.name} will not renew at ${terms.commission}%. Ceiling is about ${ceiling}%.` };
  client.contract = {
    commission: terms.commission,
    start: { ...state.date },
    termYears: Math.max(1, Math.min(5, terms.years)),
    exclusive: terms.exclusive,
    exitClause: terms.exitClause,
  };
  client.loyalty = clamp(client.loyalty + 4, 1, 99);
  return { state, ok: true, message: `Renewed ${client.name} at ${terms.commission}% for ${terms.years} years.` };
}

export function releaseClient(input: GameState, personId: number): ActionResult {
  const state = clone(input);
  const client = state.clients.find((c) => c.personId === personId && c.agency === "player");
  if (!client) return { state, ok: false, message: "They are not a client." };
  client.agency = "unsigned";
  client.rivalId = null;
  client.contract = null;
  bumpRep(state, -2);
  return { state, ok: true, message: `${client.name} is no longer represented here. The file stays, including their verdicts.` };
}

export function respondApproach(input: GameState, catalog: Catalog, approachId: string, accept: boolean, commission?: number): ActionResult {
  const state = clone(input);
  const approach = state.approaches.find((a) => a.id === approachId);
  if (!approach || approach.status !== "pending") return { state, ok: false, message: "That approach has expired." };
  if (!accept) {
    approach.status = "passed";
    return { state, ok: true, message: `Passed on ${approach.name}.` };
  }
  const rate = commission ?? approach.desiredCommission;
  const signed = signClient(state, catalog, approach.personId, {
    commission: rate,
    years: 2,
    exclusive: true,
    exitClause: true,
  });
  if (!signed.ok) return signed;
  const done = signed.state.approaches.find((a) => a.id === approachId);
  if (done && done.status === "pending") done.status = "signed";
  return signed;
}

export function hireOrUpgrade(input: GameState, role: StaffRole): ActionResult {
  const state = clone(input);
  const info = STAFF_INFO[role];
  const current = state.agency.staff.find((s) => s.role === role);
  const nextLevel = (current?.level ?? 0) + 1;
  if (nextLevel > info.max) return { state, ok: false, message: `${info.title} is already fully upgraded.` };
  const cost = info.hire * nextLevel;
  if (state.agency.cash < cost) return { state, ok: false, message: `You need $${cost.toLocaleString("en-US")} to ${current ? "upgrade" : "hire"} a ${info.title.toLowerCase()}.` };
  book(state, -cost, current ? `Upgraded ${info.title} to level ${nextLevel}` : `Hired ${info.title}`);
  if (current) current.level = nextLevel;
  else state.agency.staff.push({ role, level: nextLevel });
  return { state, ok: true, message: `${info.title} is now level ${nextLevel}. ${info.blurb}` };
}

export function fundCampaign(input: GameState, projectId: string, amount: number): ActionResult {
  const state = clone(input);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project || !project.playerInvolved) return { state, ok: false, message: "That project is not yours to campaign." };
  if (amount <= 0) return { state, ok: false, message: "Enter a campaign amount." };
  if (state.agency.cash < amount) return { state, ok: false, message: "Not enough cash for that campaign." };
  book(state, -amount, `For your consideration: ${project.title}`);
  const publicist = staffLevel(state, "publicist");
  project.fycSpend += Math.round(amount * (1 + publicist * 0.25));
  return { state, ok: true, message: `Put $${amount.toLocaleString("en-US")} behind ${project.title}.` };
}

export function submitFestival(input: GameState, projectId: string, festivalId: string, festivalName: string, week: number): ActionResult {
  const state = clone(input);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project || project.kind !== "film") return { state, ok: false, message: "Only films can play a festival." };
  if (!project.playerInvolved) return { state, ok: false, message: "You can only submit a client's film." };
  if (project.ended) return { state, ok: false, message: "It has already been released." };
  if (project.budgetTier === "tentpole" || project.budgetTier === "studio") return { state, ok: false, message: "That festival is not booking a studio tentpole." };
  if (state.festivals.some((f) => f.projectId === projectId && f.status !== "declined")) return { state, ok: false, message: "This film is already on a festival track." };
  const cost = 25_000;
  if (state.agency.cash < cost) return { state, ok: false, message: "Submission costs $25,000." };
  book(state, -cost, `Festival submission: ${project.title}`);
  project.festival = festivalName;
  state.festivals.push({
    id: `fest_${state.seq++}`,
    projectId,
    festival: festivalName,
    festivalId,
    year: state.date.year,
    week,
    status: "submitted",
  });
  return { state, ok: true, message: `Submitted ${project.title} to ${festivalName}.` };
}

export function resolveBrand(input: GameState, dealId: string, accept: boolean): ActionResult {
  const state = clone(input);
  const deal = state.brandDeals.find((d) => d.id === dealId);
  if (!deal || deal.status !== "offered") return { state, ok: false, message: "That brand deal is gone." };
  const client = state.clients.find((c) => c.personId === deal.personId && c.agency === "player");
  if (!client?.contract) return { state, ok: false, message: "They are not signed." };
  if (!accept) {
    deal.status = "declined";
    return { state, ok: true, message: `Passed on ${deal.brand}.` };
  }
  deal.status = "active";
  const commission = Math.round(deal.fee * (client.contract.commission / 100));
  book(state, commission, `${deal.brand} deal · ${client.name}`);
  client.stats.buzz = clamp(client.stats.buzz + 8, 1, 99);
  client.stats.marketability = clamp(client.stats.marketability + 2, 1, 99);
  return { state, ok: true, message: `${client.name} signed with ${deal.brand}. Commission ${commission.toLocaleString("en-US")}.` };
}

export function resolveEvent(input: GameState, eventId: string, choiceId: string): ActionResult {
  const state = clone(input);
  const ok = applyEventChoice(state, eventId, choiceId);
  return ok;
}

export function applyEventChoice(state: GameState, eventId: string, choiceId: string): ActionResult {
  const event = state.events.find((e) => e.id === eventId);
  if (!event || event.resolved) return { state, ok: false, message: "That event is already settled." };
  const choice = event.choices.find((c) => c.id === choiceId) ?? event.choices[0];
  if (!choice) return { state, ok: false, message: "No choice on that event." };
  event.resolved = choice.id;
  const client = event.personId ? state.clients.find((c) => c.personId === event.personId && c.agency === "player") : undefined;
  const project = event.projectId ? state.projects.find((p) => p.id === event.projectId) : undefined;
  const id = choice.id;
  if (client && id === "apologize") {
    client.stats.buzz = clamp(client.stats.buzz - 8, 1, 99);
    client.stats.reputation = clamp(client.stats.reputation + 2, 1, 99);
    client.loyalty = clamp(client.loyalty + 2, 1, 99);
  } else if (client && id === "ignore") {
    client.stats.buzz = clamp(client.stats.buzz - 4, 1, 99);
    client.stats.reputation = clamp(client.stats.reputation - 6, 1, 99);
    client.mood = "Unhappy";
  } else if (client && id === "spin") {
    client.stats.buzz = clamp(client.stats.buzz - 3, 1, 99);
    client.loyalty = clamp(client.loyalty + 1, 1, 99);
  } else if (project && id === "delay" && cmpDate(state.date, shootEnd(project)) <= 0) {
    tryShift(state, project, 2);
  } else if (client && id === "push") {
    client.stats.reputation = clamp(client.stats.reputation - 4, 1, 99);
    client.mood = "Unhappy";
    client.loyalty = clamp(client.loyalty - 4, 1, 99);
  } else if (client && id === "mediate") {
    client.loyalty = clamp(client.loyalty + 2, 1, 99);
  } else if (client && id === "side_client") {
    client.loyalty = clamp(client.loyalty + 6, 1, 99);
    bumpRep(state, -1);
  } else if (client && id === "side_other") {
    client.loyalty = clamp(client.loyalty - 10, 1, 99);
    client.mood = "Furious";
  } else if (id === "support_strike") {
    bumpRep(state, 2);
    if (project && cmpDate(state.date, shootEnd(project)) <= 0) tryShift(state, project, 2);
  } else if (id === "cross_line") {
    bumpRep(state, -8);
    if (client) client.mood = "Unhappy";
  } else if (client && id === "grant_leave") {
    state.holds.push({
      id: `hold_${state.seq++}`,
      personId: client.personId,
      start: { ...state.date },
      end: addWeeks(state.date, 6),
      reason: "Personal leave",
    });
    client.loyalty = clamp(client.loyalty + 8, 1, 99);
    client.mood = "Content";
  } else if (client && id === "insist") {
    client.loyalty = clamp(client.loyalty - 8, 1, 99);
    client.mood = "Furious";
    client.stats.reputation = clamp(client.stats.reputation - 3, 1, 99);
  } else if (client && id === "back_indie") {
    if (state.agency.cash >= 50_000) book(state, -50_000, `Indie support · ${client.name}`);
    client.stats.buzz = clamp(client.stats.buzz + 14, 1, 99);
    client.stats.talent = clamp(client.stats.talent + 2, 1, 99);
    client.loyalty = clamp(client.loyalty + 5, 1, 99);
  } else if (client && id === "pass_indie") {
    client.loyalty = clamp(client.loyalty - 2, 1, 99);
  } else if (client && id === "encourage_franchise") {
    client.nextPreference = "commercial";
    client.stats.buzz = clamp(client.stats.buzz + 6, 1, 99);
  } else if (client && id === "caution_franchise") {
    client.loyalty = clamp(client.loyalty + 2, 1, 99);
  } else if (client && id === "match_poach") {
    if (client.contract) client.contract.commission = Math.max(5, client.contract.commission - 2);
    client.loyalty = clamp(client.loyalty + 10, 1, 99);
    client.mood = "Content";
  } else if (client && id === "persuade") {
    const lawyer = staffLevel(state, "lawyer");
    const hold = client.loyalty + state.agency.reputation / 2 + lawyer * 8 + (client.contract?.exitClause ? 8 : 0);
    if (hold < 70) {
      loseClient(state, client, "They heard the pitch and left anyway.");
    } else {
      client.loyalty = clamp(client.loyalty + 4, 1, 99);
    }
  } else if (client && id === "let_go") {
    loseClient(state, client, "You let them walk.");
  } else if (client && id === "lean_in") {
    client.stats.buzz = clamp(client.stats.buzz + 16, 1, 99);
    client.stats.reputation = clamp(client.stats.reputation - 2, 1, 99);
  } else if (client && id === "stay_quiet") {
    client.stats.buzz = clamp(client.stats.buzz + 6, 1, 99);
  } else if (client && id === "back_actor") {
    client.loyalty = clamp(client.loyalty + 5, 1, 99);
  } else if (client && id === "back_director") {
    client.loyalty = clamp(client.loyalty - 6, 1, 99);
    client.mood = "Unhappy";
  } else if (project && id === "accept_delay" && cmpDate(state.date, shootEnd(project)) <= 0) {
    tryShift(state, project, 2);
  } else if (id === "pay_overtime") {
    if (state.agency.cash >= 20_000) book(state, -20_000, "Overtime to keep the dates");
    if (client) client.mood = "Content";
  }
  state.inbox.unshift({
    id: `in_${state.seq++}`,
    date: { ...state.date },
    kind: "event",
    title: event.title,
    body: `You chose: ${choice.label}.`,
    read: false,
  });
  return { state, ok: true, message: `${event.title}: ${choice.label}.` };
}

function loseClient(state: GameState, client: Client, why: string): void {
  client.agency = "rival";
  client.rivalId = "meridian";
  client.contract = null;
  bumpRep(state, -4);
  state.inbox.unshift({
    id: `in_${state.seq++}`,
    date: { ...state.date },
    kind: "system",
    title: `${client.name} left the agency`,
    body: why,
    href: "/rivals",
    read: false,
  });
}

export function pendingConflictMessage(state: GameState, personId: number, project: Project): string | null {
  return scheduleConflict(state, personId, project.prepStart, shootEnd(project), project.id)?.message ?? null;
}

export function offerWalkaway(state: GameState, client: Client, fee: number, studio: string): { walkAwayFee: number; walkAwayBackend: number; minBilling: number } {
  const lawyer = staffLevel(state, "lawyer");
  const heat = client.studioHeat[studio] ?? 0;
  const generosity = 1.16 + (state.rng.s % 20) / 100 + lawyer * 0.05 + client.stats.reputation / 500 - heat * 0.05;
  return {
    walkAwayFee: Math.round(fee * Math.max(1.05, generosity)),
    walkAwayBackend: Math.min(8, 2 + (lawyer > 0 ? 2 : 1)),
    minBilling: client.stats.starPower > 75 ? 1 : 2,
  };
}

export function tierBias(tier: BudgetTier): number {
  if (tier === "tentpole") return 5;
  if (tier === "studio") return 4;
  if (tier === "mid") return 3;
  if (tier === "indie") return 2;
  return 1;
}

export { cmpDate };
