import { STAFF_INFO } from "./constants";
import { castFromClient, nextId } from "./generate";
import { agencyTier, clamp, clientFromCatalog, expectedFee, genreFit, rosterCap } from "./people";
import { longOrderRefusal } from "./career";
import { addWeeks, blocksConflict, cmpDate, formatDate, scheduleConflict, shootEnd, tryShift } from "./schedule";
import type { ActionResult, Approach, ApproachAsk, BudgetTier, Catalog, Client, GameState, HiddenTraits, LedgerBucket, Offer, Project, StaffRole } from "./types";

function clone(state: GameState): GameState {
  return structuredClone(state);
}

export function book(state: GameState, amount: number, label: string, bucket: LedgerBucket = "other"): void {
  state.agency.cash = Math.round(state.agency.cash + amount);
  state.ledger.unshift({
    date: { ...state.date },
    label,
    amount: Math.round(amount),
    balance: state.agency.cash,
    bucket,
  });
  if (state.ledger.length > 400) state.ledger.length = 400;
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
  const seasonEpisodes = project.kind === "series" ? project.seasons[project.seasons.length - 1]?.episodes ?? 0 : 0;
  const longOrder = project.kind === "series" ? longOrderRefusal(client, role, seasonEpisodes) : null;
  if (longOrder) score -= 30;
  score = Math.round(score);
  if (score < 52) {
    const bits = [];
    if (fit < 45) bits.push(`${project.genres[0]} is outside their comfort`);
    if (client.nextPreference === "prestige" && project.prestige < 58) bits.push("they asked for prestige after the last one");
    if (client.traits.prestigeVsMoney >= 68 && project.prestige < 48) bits.push("this reads as a paycheck, and they are not in a paycheck mood");
    if (client.traits.greed >= 70 && fee < fair * 0.85) bits.push("the quote is light for them");
    if (client.traits.ambition >= 75 && billing > 2) bits.push("the billing is beneath where they think they are");
    if (longOrder) bits.push(longOrder);
    return {
      score,
      warning: `${client.name} may refuse ${project.title}. ${bits.join("; ") || "It clashes with what they want right now."} Confirming an override will cost loyalty${score < 38 ? ", and they may still walk" : ""}.`,
    };
  }
  if (longOrder) return { score, warning: longOrder };
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
  const conflict = offer.blocks?.length
    ? blocksConflict(state, client.personId, offer.blocks, project.id)
    : scheduleConflict(state, client.personId, project.prepStart, shootEnd(project), project.id);
  if (conflict) return { state, ok: false, message: conflict.message };
  const fit = actorFit(client, project, offer.fee, offer.billing, offer.role);
  const better = betterOfferWarning(state, offer);
  const warning = [fit.warning, better].filter(Boolean).join(" ");
  if (warning && !confirm) return { state: input, ok: false, message: warning, warning };
  if (fit.score < 38) {
    offer.status = "actor_refused";
    closeInbox(state, offer.id);
    client.loyalty = clamp(client.loyalty - 6, 1, 99);
    client.mood = "Unhappy";
    client.overrides += 1;
    fillNpcLater(project);
    state.inbox.unshift({
      id: `in_${++state.seq}`,
      date: { ...state.date },
      kind: "offer",
      title: `${client.name} passed on ${project.title}`,
      body: fit.warning ?? "They refused the job.",
      href: `/actors/${client.personId}`,
      read: false,
      resolved: false,
    });
    return { state, ok: false, message: `${client.name} refused ${project.title}. Loyalty slipped.` };
  }
  if (fit.warning && confirm) {
    client.loyalty = clamp(client.loyalty - 6, 1, 99);
    client.overrides += 1;
    if (client.mood === "Content" || client.mood === "Thrilled") client.mood = "Uneasy";
  }
  const character = project.openRole?.character ?? offer.character ?? "Lead";
  const existing = offer.renewal ? project.cast.find((member) => member.personId === client.personId) : undefined;
  if (existing) {
    existing.active = true;
    existing.writtenOut = false;
    existing.role = offer.role;
    existing.fee = offer.fee;
    existing.billing = offer.billing;
    existing.backend = offer.backend;
    existing.backendStyle = offer.backendStyle;
    existing.bonuses = offer.bonuses;
    existing.episodeFee = offer.episodeFee;
    existing.episodes = offer.episodes;
    existing.blocks = offer.blocks;
    existing.seasonNumber = offer.seasonNumber ?? existing.seasonNumber;
    existing.episodesPaid = 0;
    if (offer.deal && offer.episodeFee) {
      existing.seriesDeal = {
        style: offer.deal.style,
        seasons: offer.deal.seasons,
        seasonsServed: (existing.seriesDeal?.seasonsServed ?? 0) + 1,
        annualBump: offer.deal.annualBump,
        episodeFee: offer.episodeFee,
        role: offer.role,
      };
    }
  } else {
    const member = castFromClient(client, offer.role, offer.billing, offer.fee, offer.backend, character);
    member.episodeFee = offer.episodeFee;
    member.episodes = offer.episodes;
    member.blocks = offer.blocks;
    member.seasonNumber = offer.seasonNumber ?? (project.kind === "series" ? project.seasons[project.seasons.length - 1]?.number : undefined);
    member.backendStyle = offer.backendStyle;
    member.bonuses = offer.bonuses;
    if (offer.deal && offer.episodeFee) {
      member.seriesDeal = {
        style: offer.deal.style,
        seasons: offer.deal.seasons,
        seasonsServed: 1,
        annualBump: offer.deal.annualBump,
        episodeFee: offer.episodeFee,
        role: offer.role,
      };
    }
    project.cast.push(member);
    if (offer.pay === "pilot" && project.pilot) {
      state.holds.push({
        id: `hold_${++state.seq}`,
        personId: client.personId,
        start: { ...state.date },
        end: project.pilot.decision,
        until: project.pilot.decision,
        reason: `Pilot option · ${project.title}`,
        kind: "pilot",
        projectId: project.id,
      });
    }
    if (offer.deal?.style === "guaranteed" && offer.pay === "episode") {
      const season = project.seasons[project.seasons.length - 1];
      if (season) {
        const start = addWeeks(season.shootStart, season.shootWeeks);
        state.holds.push({
          id: `hold_${++state.seq}`,
          personId: client.personId,
          start,
          end: addWeeks(start, offer.deal.seasons * 36),
          reason: `Multi-season lock · ${project.title}`,
          kind: "series",
          projectId: project.id,
        });
      }
    }
  }
  project.cast.sort((a, b) => a.billing - b.billing);
  project.openRole = null;
  project.playerInvolved = true;
  if (offer.perk) project.logline = `${project.logline} Perk: ${offer.perk}.`;
  offer.status = "accepted";
  closeInbox(state, offer.id);
  for (const other of state.offers) {
    if (other.status !== "pending" || other.personId !== client.personId || other.id === offer.id) continue;
    const otherProject = state.projects.find((p) => p.id === other.projectId);
    if (!otherProject) continue;
    const clash = scheduleConflict(state, client.personId, otherProject.prepStart, shootEnd(otherProject), otherProject.id);
    if (clash) {
      other.status = "expired";
      closeInbox(state, other.id);
      otherProject.openRole = null;
      state.inbox.unshift({
        id: `in_${++state.seq}`,
        date: { ...state.date },
        kind: "offer",
        title: `Passed on ${otherProject.title}`,
        body: `${client.name} is now booked. ${clash.message}`,
        href: "/offers",
        read: false,
        resolved: false,
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
  closeInbox(state, offer.id);
  const project = state.projects.find((p) => p.id === offer.projectId);
  if (project) {
    project.openRole = null;
    if (offer.renewal) {
      const member = project.cast.find((row) => row.personId === offer.personId);
      if (member) {
        member.writtenOut = true;
        member.active = false;
      }
    }
  }
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
    closeInbox(state, offer.id);
    client.studioHeat[offer.studio] = (client.studioHeat[offer.studio] ?? 0) + 2;
    project.openRole = null;
    state.inbox.unshift({
      id: `in_${++state.seq}`,
      date: { ...state.date },
      kind: "offer",
      title: `${offer.studio} walked away`,
      body: `The counter on ${project.title} for ${client.name} cleared their walk-away. They will remember.`,
      href: "/offers",
      read: false,
      resolved: false,
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
  if (offer.pay === "episode" && offer.episodes) offer.episodeFee = Math.max(5_000, Math.round(fee / offer.episodes / 1000) * 1000);
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
  const roster = state.clients.filter((row) => row.agency === "player" && row.contract).length;
  const cap = rosterCap(state.agency.tier);
  if (roster >= cap) {
    return {
      state: input,
      ok: false,
      message: `The roster is full (${roster}/${cap} for a ${state.agency.tier} shop). Release someone before signing another client.`,
    };
  }
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
  if (approach) {
    approach.status = "signed";
    approach.lastReply = { outcome: "accepted", reason: `Signed at ${terms.commission}%.` };
    closeApproachInbox(state, approach);
  }
  bumpRep(state, poach ? 2 : 1);
  state.inbox.unshift({
    id: `in_${++state.seq}`,
    date: { ...state.date },
    kind: "system",
    title: `${client.name} signed`,
    body: `${terms.commission}% for ${terms.years} year${terms.years === 1 ? "" : "s"}${terms.exclusive ? ", exclusive" : ""}.`,
    href: `/actors/${client.personId}`,
    read: false,
    resolved: false,
  });
  return { state, ok: true, message: `${client.name} is now a client at ${terms.commission}%.`, href: `/actors/${client.personId}` };
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

export function closeInbox(state: GameState, refId: string): void {
  for (const item of state.inbox) {
    if (item.refId === refId && !item.resolved) item.resolved = true;
  }
}

export function closeApproachInbox(state: GameState, approach: Approach): void {
  closeInbox(state, approach.id);
  for (const item of state.inbox) {
    if (item.resolved || item.kind !== "approach") continue;
    if (item.title.startsWith(`${approach.name} wants`)) item.resolved = true;
  }
}

export function walkAwayCommission(ask: number, traits: Pick<HiddenTraits, "greed" | "loyalty" | "ambition">, reputation: number): number {
  const room = Math.round((100 - traits.greed) / 25 + traits.loyalty / 30 + reputation / 20 - traits.ambition / 28);
  return clamp(ask + Math.max(0, room), ask, 20);
}

export function approachTolerance(traits: Pick<HiddenTraits, "greed" | "loyalty" | "ambition">, reputation: number): number {
  return 2.2 + (100 - traits.greed) / 35 + traits.loyalty / 40 + reputation / 30 - traits.ambition / 55;
}

export function counterPain(ask: ApproachAsk, counter: ApproachAsk, greed: number): number {
  const extra = Math.max(0, counter.commission - ask.commission);
  let pain = extra * (1.1 + greed / 80);
  const yearGap = ask.termYears - counter.termYears;
  if (yearGap > 0) pain += yearGap * 1.4;
  else if (yearGap < 0) pain += -yearGap * 0.4;
  if (ask.exclusive && !counter.exclusive) pain += 2.2;
  if (!ask.exclusive && counter.exclusive) pain += 1;
  if (ask.exitClause && !counter.exitClause) pain += 1.6;
  if (!ask.exitClause && counter.exitClause) pain += 0.3;
  return pain;
}

export function judgeApproachCounter(
  ask: ApproachAsk,
  counter: ApproachAsk,
  traits: Pick<HiddenTraits, "greed" | "loyalty" | "ambition">,
  reputation: number,
  walkAway: number,
): { outcome: "accepted" | "counter" | "walked"; reason: string; nextAsk: ApproachAsk } {
  const pain = counterPain(ask, counter, traits.greed);
  const tolerance = approachTolerance(traits, reputation);
  if (counter.commission > walkAway || pain > tolerance) {
    return {
      outcome: "walked",
      reason: counter.commission > walkAway
        ? "That commission is past what they will live with."
        : "The package asks too much. They left the meeting.",
      nextAsk: { ...ask },
    };
  }
  if (pain <= tolerance * 0.35) {
    return {
      outcome: "accepted",
      reason: "They will take those terms. The number sits inside what they walked in hoping for.",
      nextAsk: normalizeAsk(counter),
    };
  }
  const mid = Math.round((ask.commission + counter.commission) / 2);
  const nextAsk = normalizeAsk({
    ...ask,
    commission: Math.min(walkAway, Math.max(ask.commission, mid)),
  });
  return {
    outcome: "counter",
    reason: `They will not go to ${counter.commission}%. They will meet you at ${nextAsk.commission}% if the rest of the deal stays as they asked.`,
    nextAsk,
  };
}

export function approachBlocker(state: GameState, approach: Approach): string | null {
  if (approach.status === "expired" || (approach.status === "pending" && cmpDate(approach.expires, state.date) < 0)) {
    return `${approach.name} stopped waiting. This approach expired ${formatDate(approach.expires)}.`;
  }
  if (approach.status === "walked") return `${approach.name} already walked out of the meeting.`;
  if (approach.status === "passed") return `You already passed on ${approach.name}.`;
  if (approach.status === "signed") return `${approach.name} is already signed from this meeting.`;
  const client = state.clients.find((row) => row.personId === approach.personId);
  if (client?.agency === "player" && client.contract) return `${approach.name} is already on the roster.`;
  if (client?.agency === "rival") {
    const rival = state.rivals.find((row) => row.id === client.rivalId)?.name ?? "a rival";
    return `${approach.name} already signed with ${rival}.`;
  }
  const cap = rosterCap(state.agency.tier);
  const count = state.clients.filter((row) => row.agency === "player" && row.contract).length;
  if (count >= cap) return `The roster is full (${count}/${cap} for a ${state.agency.tier} shop). Release someone before you sign ${approach.name}.`;
  return null;
}

export function presentApproach(approach: Approach): Approach {
  const fallback = approach.ask?.commission || approach.desiredCommission || 10;
  const ask = normalizeAsk(approach.ask?.commission ? approach.ask : { commission: fallback, termYears: 2, exclusive: true, exitClause: true });
  approach.ask = ask;
  approach.desiredCommission = ask.commission;
  approach.opening = approach.opening?.commission ? normalizeAsk(approach.opening) : { ...ask };
  approach.line = approach.line || approach.pitch || `${approach.name} asked for a meeting.`;
  approach.pitch = approach.pitch || approach.line;
  if (!approach.walkAwayCommission) approach.walkAwayCommission = Math.min(20, ask.commission + 2);
  return approach;
}

export function pushApproach(state: GameState, catalog: Catalog, personId: number, options?: { commission?: number; weeks?: number }): Approach | null {
  const person = catalog.actors.find((actor) => actor.id === personId);
  if (!person) return null;
  const client = clientFromCatalog(person, "unsigned", state.date, null);
  const ceiling = maxCommission(client, state.agency.reputation, false);
  const desired = options?.commission ?? Math.max(5, Math.min(15, 11 - Math.round(state.agency.reputation / 25) + (client.traits.greed > 70 ? 2 : 0)));
  const commission = clamp(Math.round(desired), 5, ceiling);
  const ask: ApproachAsk = { commission, termYears: 2, exclusive: true, exitClause: true };
  const approach: Approach = {
    id: nextId(state, "app"),
    personId: person.id,
    name: person.name,
    profilePath: person.profilePath,
    fame: client.fame,
    pitch: pitchFor(client),
    line: approachLine(client),
    opening: { ...ask },
    ask: { ...ask },
    desiredCommission: commission,
    walkAwayCommission: Math.min(ceiling, walkAwayCommission(commission, client.traits, state.agency.reputation)),
    expires: addWeeks(state.date, options?.weeks ?? 4),
    status: "pending",
  };
  state.approaches.unshift(approach);
  state.inbox.unshift({
    id: nextId(state, "in"),
    date: { ...state.date },
    kind: "approach",
    title: `${person.name} wants a meeting`,
    body: `They are asking about ${commission}% and a two-year exclusive. Open through ${formatDate(approach.expires)}.`,
    href: `/meetings/${approach.id}`,
    read: false,
    resolved: false,
    refId: approach.id,
  });
  return approach;
}

function pitchFor(client: Client): string {
  if (client.fame === "Unknown" || client.fame === "Working") return "A working actor who thinks a smaller shop will actually pick up the phone.";
  if (client.traits.prestigeVsMoney > 65) return "They want fewer meetings and better scripts.";
  if (client.traits.greed > 65) return "They heard you close quotes. They want that, in writing.";
  return "Looking for representation that will say no on their behalf.";
}

export function approachLine(client: Client): string {
  const first = client.name.split(" ")[0] || client.name;
  if (client.traits.greed >= 70) return `${first} does not do charity. The number on the table is the number.`;
  if (client.traits.ambition >= 75) return `${first} is done waiting in other people's waiting rooms.`;
  if (client.traits.loyalty >= 70) return `${first} wants a shop that picks up the phone and stays.`;
  if (client.traits.prestigeVsMoney >= 68) return `${first} will take a smaller cut of the fee if the scripts are better.`;
  return `${first} is here because the last shop stopped returning calls.`;
}

function normalizeAsk(ask: ApproachAsk): ApproachAsk {
  return {
    commission: clamp(Math.round(ask.commission || 10), 5, 20),
    termYears: clamp(Math.round(ask.termYears || 2), 1, 5),
    exclusive: Boolean(ask.exclusive),
    exitClause: Boolean(ask.exitClause),
  };
}

function toTerms(ask: ApproachAsk): { commission: number; years: number; exclusive: boolean; exitClause: boolean } {
  return { commission: ask.commission, years: ask.termYears, exclusive: ask.exclusive, exitClause: ask.exitClause };
}

function evenTraits(): HiddenTraits {
  return { ambition: 50, loyalty: 50, greed: 50, prestigeVsMoney: 50, riskAppetite: 50 };
}

function settleClosedApproach(state: GameState, approach: Approach, reason: string): void {
  if (approach.status === "pending" && cmpDate(approach.expires, state.date) < 0) approach.status = "expired";
  const client = state.clients.find((row) => row.personId === approach.personId);
  if (approach.status === "pending" && client?.agency === "player" && client.contract) approach.status = "signed";
  if (approach.status === "pending" && client?.agency === "rival") approach.status = "passed";
  if (approach.status === "pending") approach.status = "passed";
  approach.lastReply = { outcome: approach.status === "signed" ? "accepted" : "passed", reason };
  closeApproachInbox(state, approach);
}

function handToRival(state: GameState, catalog: Catalog, personId: number, ask: ApproachAsk): string | null {
  const existing = state.clients.find((row) => row.personId === personId);
  if (existing?.agency === "player" || existing?.agency === "rival") return null;
  const person = catalog.actors.find((actor) => actor.id === personId);
  if (!person) return null;
  const preview = existing ?? clientFromCatalog(person, "unsigned", state.date, null);
  if (preview.traits.ambition + preview.traits.greed < 130) return null;
  const rival = state.rivals[0];
  if (!rival) return null;
  preview.agency = "rival";
  preview.rivalId = rival.id;
  preview.contract = {
    commission: ask.commission,
    start: { ...state.date },
    termYears: ask.termYears,
    exclusive: true,
    exitClause: false,
  };
  if (!existing) state.clients.push(preview);
  return rival.name;
}

export function respondApproach(
  input: GameState,
  catalog: Catalog,
  approachId: string,
  action: "accept" | "decline" | "counter",
  terms?: ApproachAsk,
): ActionResult {
  const state = clone(input);
  const approach = state.approaches.find((row) => row.id === approachId);
  if (!approach) return { state: input, ok: false, message: "That meeting is not in this save.", href: "/dashboard" };
  presentApproach(approach);
  const meeting = `/meetings/${approach.id}`;
  const block = approachBlocker(state, approach);
  const rosterFull = Boolean(block?.includes("roster is full"));
  if (block && !rosterFull) {
    const leaving = approach.status !== "pending" && action === "decline";
    settleClosedApproach(state, approach, block);
    const onRoster = state.clients.find((row) => row.personId === approach.personId && row.agency === "player" && row.contract);
    return {
      state,
      ok: leaving || Boolean(onRoster),
      message: block,
      href: onRoster ? `/actors/${approach.personId}` : leaving ? "/dashboard" : meeting,
    };
  }
  if (approach.status !== "pending") {
    closeApproachInbox(state, approach);
    return { state, ok: false, message: block ?? "That meeting is already closed.", href: "/dashboard" };
  }
  if (action === "decline") {
    approach.status = "passed";
    const rival = handToRival(state, catalog, approach.personId, approach.ask);
    const reason = rival
      ? `${approach.name} took the pass personally and signed with ${rival}.`
      : `${approach.name} left it there. They may come back, or they may not.`;
    approach.lastReply = { outcome: "passed", reason };
    closeApproachInbox(state, approach);
    return { state, ok: true, message: reason, href: "/dashboard" };
  }
  if (rosterFull && block) {
    return { state: input, ok: false, message: block, href: meeting };
  }
  const offer = action === "counter" && terms ? normalizeAsk(terms) : { ...approach.ask };
  if (action === "accept") {
    const signed = signClient(state, catalog, approach.personId, toTerms(approach.ask));
    if (!signed.ok) return { ...signed, href: signed.href ?? meeting };
    return signed;
  }
  const person = catalog.actors.find((actor) => actor.id === approach.personId);
  const traits = person ? clientFromCatalog(person, "unsigned", state.date, null).traits : evenTraits();
  const judged = judgeApproachCounter(approach.ask, offer, traits, state.agency.reputation, approach.walkAwayCommission);
  if (judged.outcome === "walked") {
    approach.status = "walked";
    approach.lastReply = { outcome: "walked", reason: judged.reason };
    closeApproachInbox(state, approach);
    return { state, ok: false, message: judged.reason, href: meeting };
  }
  if (judged.outcome === "counter") {
    approach.ask = judged.nextAsk;
    approach.desiredCommission = judged.nextAsk.commission;
    approach.lastReply = { outcome: "counter", reason: judged.reason };
    return { state, ok: true, message: judged.reason, href: meeting };
  }
  const signed = signClient(state, catalog, approach.personId, toTerms(judged.nextAsk));
  if (!signed.ok) return { ...signed, href: signed.href ?? meeting };
  const done = signed.state.approaches.find((row) => row.id === approachId);
  if (done) done.lastReply = { outcome: "accepted", reason: judged.reason };
  return { ...signed, message: `${signed.message} ${judged.reason}` };
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
    id: `fest_${++state.seq}`,
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
    closeInbox(state, deal.id);
    return { state, ok: true, message: `Passed on ${deal.brand}.` };
  }
  deal.status = "active";
  closeInbox(state, deal.id);
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
  closeInbox(state, event.id);
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
      id: `hold_${++state.seq}`,
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
    id: `in_${++state.seq}`,
    date: { ...state.date },
    kind: "event",
    title: event.title,
    body: `You chose: ${choice.label}.`,
    read: false,
    resolved: false,
  });
  return { state, ok: true, message: `${event.title}: ${choice.label}.` };
}

function loseClient(state: GameState, client: Client, why: string): void {
  client.agency = "rival";
  client.rivalId = "meridian";
  client.contract = null;
  bumpRep(state, -4);
  state.inbox.unshift({
    id: `in_${++state.seq}`,
    date: { ...state.date },
    kind: "system",
    title: `${client.name} left the agency`,
    body: why,
    href: "/rivals",
    read: false,
    resolved: false,
  });
}

export function pendingConflictMessage(state: GameState, personId: number, project: Project, blocks?: { start: GameState["date"]; weeks: number }[]): string | null {
  if (blocks?.length) return blocksConflict(state, personId, blocks, project.id)?.message ?? null;
  if (project.origin === "pilot" || project.pilot) {
    return scheduleConflict(state, personId, project.shootStart, addWeeks(project.shootStart, 1), project.id)?.message ?? null;
  }
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
