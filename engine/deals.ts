import { book } from "./actions";
import {
  buildBlocks,
  bumpedFee,
  cancellationBuyout,
  dealBlurb,
  episodeQuote,
  growFilmStar,
  rollPilotOutcome,
  shouldRecast,
  sideRng,
} from "./career";
import { chance, int, type RngState } from "./rng";
import { absWeek, addWeeks, cmpDate, memberShootIntervals } from "./schedule";
import type { CastMember, Client, GameState, Project, Season, WorkBlock } from "./types";

function saltOf(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % 9973;
  return n + 1;
}

export function offerSalt(projectId: string, personId: number): number {
  return saltOf(projectId) + personId;
}

function note(state: GameState, kind: GameState["inbox"][number]["kind"], title: string, body: string, href?: string): void {
  state.inbox.unshift({
    id: `in_${++state.seq}`,
    date: { ...state.date },
    kind,
    title,
    body,
    href,
    read: false,
    resolved: false,
  });
}

export function fullSeasonBlock(season: Season): WorkBlock {
  const end = absWeek(addWeeks(season.shootStart, Math.max(1, season.shootWeeks) - 1));
  const weeks = end - absWeek(season.prepStart) + 1;
  return { start: { ...season.prepStart }, weeks, episodes: season.episodes };
}

export function payShootCommissions(state: GameState): void {
  for (const project of state.projects) {
    if (project.cancelled) continue;
    if (project.kind === "series") paySeries(state, project);
    else payFilmOrPilotLump(state, project);
  }
}

function payPilotFee(state: GameState, project: Project): void {
  for (const member of project.cast) {
    if (!member.active || member.writtenOut || !member.isPlayerClient) continue;
    if (project.commissionsPaid.includes(member.personId)) continue;
    const start = member.blocks?.[0]?.start ?? project.shootStart;
    if (cmpDate(start, state.date) !== 0) continue;
    const client = clientOf(state, member.personId);
    if (!client?.contract) continue;
    const commission = Math.round(member.fee * (client.contract.commission / 100));
    book(state, commission, `Pilot commission · ${client.name} · ${project.title}`, "pilot");
    project.commissionsPaid.push(member.personId);
  }
}

function clientOf(state: GameState, personId: number): Client | undefined {
  return state.clients.find((client) => client.personId === personId && client.agency === "player" && client.contract);
}

function payFilmOrPilotLump(state: GameState, project: Project): void {
  if (cmpDate(project.shootStart, state.date) !== 0) return;
  const pilot = project.origin === "pilot" || project.pilot?.status === "awaiting" || project.pilot?.status === "shooting";
  for (const member of project.cast) {
    if (!member.active || member.writtenOut || !member.isPlayerClient) continue;
    if (project.commissionsPaid.includes(member.personId)) continue;
    const client = clientOf(state, member.personId);
    if (!client?.contract) continue;
    const commission = Math.round(member.fee * (client.contract.commission / 100));
    book(
      state,
      commission,
      pilot ? `Pilot commission · ${client.name} · ${project.title}` : `Commission · ${client.name} · ${project.title}`,
      pilot ? "pilot" : "film",
    );
    project.commissionsPaid.push(member.personId);
    state.lastTurn.push(`${client.name} started ${project.title}. Commission $${commission.toLocaleString("en-US")}.`);
  }
}

function paySeries(state: GameState, project: Project): void {
  const season = project.seasons[project.seasons.length - 1];
  if (!season) return;
  if (project.pilot && project.pilot.status !== "picked_up") {
    payPilotFee(state, project);
    return;
  }
  const now = absWeek(state.date);
  for (const member of project.cast) {
    if (!member.active || member.writtenOut || !member.isPlayerClient) continue;
    if (!member.episodeFee) {
      if (cmpDate(season.shootStart, state.date) !== 0) continue;
      if (project.commissionsPaid.includes(member.personId)) continue;
      const client = clientOf(state, member.personId);
      if (!client?.contract) continue;
      const commission = Math.round(member.fee * (client.contract.commission / 100));
      book(state, commission, `Series commission · ${client.name} · ${project.title}`, "series");
      project.commissionsPaid.push(member.personId);
      continue;
    }
    const blocks = member.blocks?.length ? member.blocks : [fullSeasonBlock(season)];
    const active = blocks.find((block) => {
      const start = absWeek(block.start);
      return now >= start && now <= start + Math.max(1, block.weeks) - 1;
    });
    if (!active) continue;
    const owed = Math.max(1, member.episodes ?? season.episodes);
    const paid = member.episodesPaid ?? 0;
    if (paid >= owed - 0.001) continue;
    const totalWeeks = Math.max(1, blocks.reduce((sum, block) => sum + Math.max(1, block.weeks), 0));
    const start = absWeek(active.start);
    const lastWeek = now === start + Math.max(1, active.weeks) - 1 && blocks.every((block) => absWeek(block.start) + block.weeks - 1 <= now);
    const slice = lastWeek ? owed - paid : Math.min(owed - paid, owed / totalWeeks);
    member.episodesPaid = Math.min(owed, paid + slice);
    const client = clientOf(state, member.personId);
    if (!client?.contract) continue;
    const commission = Math.round(member.episodeFee * slice * (client.contract.commission / 100));
    if (commission <= 0) continue;
    book(state, commission, `Episode pay · ${client.name} · ${project.title}`, "series");
  }
}

export function resolvePilotDecisions(state: GameState): void {
  for (const project of state.projects) {
    if (project.kind !== "series" || !project.pilot || project.cancelled) continue;
    if (project.pilot.status !== "awaiting" && project.pilot.status !== "retooled" && project.pilot.status !== "shooting") continue;
    if (cmpDate(state.date, project.pilot.decision) < 0) continue;
    if (state.offers.some((offer) => offer.projectId === project.id && offer.status === "pending" && offer.pay === "pilot")) continue;
    const rng = sideRng(state, 80 + saltOf(project.id));
    const outcome = rollPilotOutcome(rng);
    if (outcome === "picked_up") pickupPilot(state, project);
    else if (outcome === "passed") passPilot(state, project);
    else retoolPilot(state, project, rng);
  }
}

function pickupPilot(state: GameState, project: Project): void {
  const pilot = project.pilot!;
  pilot.status = "picked_up";
  project.origin = "straight";
  const season = project.seasons[project.seasons.length - 1];
  for (const member of project.cast) {
    if (!member.active || member.writtenOut) continue;
    if (member.role === "Guest Star" || member.role === "Recurring") continue;
    if (!season) continue;
    member.blocks = [fullSeasonBlock(season)];
    member.episodes = season.episodes;
    member.episodeFee = member.episodeFee || pilot.optionFee;
    member.fee = member.episodeFee * season.episodes;
    member.seriesDeal = member.seriesDeal ?? {
      style: pilot.optionSeasons > 1 ? "option" : "single",
      seasons: Math.max(1, pilot.optionSeasons),
      seasonsServed: 1,
      annualBump: 0.06,
      episodeFee: member.episodeFee,
      role: member.role,
    };
    releaseOverlaps(state, member.personId, member.blocks, project.id, `${member.name} was released from other work because ${project.title} was picked up.`);
    if (member.isPlayerClient) {
      note(
        state,
        "offer",
        `${project.title} is picked up`,
        `${member.name} is locked for season 1 at $${member.episodeFee.toLocaleString("en-US")} an episode. ${dealBlurb(member.seriesDeal)}`,
        `/projects/${project.id}`,
      );
    }
  }
  state.holds = state.holds.filter((hold) => !(hold.kind === "pilot" && hold.projectId === project.id));
  state.lastTurn.push(`${project.title} picked up to series.`);
}

function passPilot(state: GameState, project: Project): void {
  project.pilot!.status = "passed";
  project.cancelled = true;
  project.ended = true;
  for (const member of project.cast) {
    if (member.isPlayerClient && member.active) {
      note(state, "news", `${project.title} was not picked up`, `${member.name} is free. The series option died with the pilot.`, `/projects/${project.id}`);
    }
    member.active = false;
  }
  state.holds = state.holds.filter((hold) => hold.projectId !== project.id);
  state.lastTurn.push(`${project.title} pilot passed.`);
}

function retoolPilot(state: GameState, project: Project, rng: RngState): void {
  const pilot = project.pilot!;
  pilot.status = "retooled";
  const season = project.seasons[project.seasons.length - 1];
  const recast = shouldRecast(rng);
  if (recast) {
    for (const member of [...project.cast]) {
      if (member.role !== "Lead" && member.role !== "Series Regular" && member.role !== "Co-lead") continue;
      member.writtenOut = true;
      member.active = false;
      if (member.isPlayerClient) {
        note(state, "offer", `${project.title} is being retooled`, `${member.name} was recast. The option is gone.`, `/actors/${member.personId}`);
      }
    }
  }
  if (season) {
    season.shootStart = addWeeks(state.date, 6);
    season.prepStart = addWeeks(season.shootStart, -2);
    season.premiere = addWeeks(season.shootStart, season.shootWeeks + 4);
    pilot.decision = addWeeks(season.shootStart, 4);
    project.shootStart = season.shootStart;
    project.prepStart = season.prepStart;
    project.release = season.premiere;
  }
  state.holds = state.holds.filter((hold) => !(hold.kind === "pilot" && hold.projectId === project.id));
  state.lastTurn.push(`${project.title} pilot retooled${recast ? " and recast" : ""}.`);
}

function releaseOverlaps(state: GameState, personId: number, blocks: WorkBlock[], keepId: string, body: string): void {
  for (const other of state.projects) {
    if (other.id === keepId || other.cancelled) continue;
    const member = other.cast.find((row) => row.personId === personId && row.active && !row.writtenOut);
    if (!member) continue;
    const theirs = memberShootIntervals(other, member);
    const hit = blocks.some((block) =>
      theirs.some((otherBlock) => {
        const a0 = absWeek(block.start);
        const a1 = a0 + block.weeks - 1;
        return a0 <= otherBlock.end && otherBlock.start <= a1;
      }),
    );
    if (!hit) continue;
    member.writtenOut = true;
    member.active = false;
    if (member.isPlayerClient) note(state, "system", `${member.name} dropped from ${other.title}`, body, `/projects/${other.id}`);
  }
}

export function payCancellation(state: GameState, project: Project, member: CastMember, episodes: number): void {
  const payout = cancellationBuyout(member.seriesDeal, episodes);
  if (payout <= 0 || !member.isPlayerClient) return;
  const client = clientOf(state, member.personId);
  if (!client?.contract) return;
  const commission = Math.round(payout * (client.contract.commission / 100));
  book(state, commission, `Series buyout · ${client.name} · ${project.title}`, "series");
  note(state, "money", `${project.title} paid a buyout`, `${client.name} had seasons left. Commission $${commission.toLocaleString("en-US")}.`, `/agency`);
}

export type RenewalMove = "stay" | "negotiate" | "drop";

export function renewalMove(state: GameState, member: CastMember, seasonNumber: number): RenewalMove {
  const deal = member.seriesDeal;
  if (deal && deal.style === "guaranteed" && deal.seasonsServed < deal.seasons) return "stay";
  if (deal?.style === "option") {
    const rng = sideRng(state, 60 + member.personId + seasonNumber);
    if (chance(rng, 0.28)) return "drop";
    if (member.isPlayerClient && (member.role === "Lead" || member.role === "Series Regular" || member.role === "Co-lead")) return "negotiate";
    return "stay";
  }
  if (member.isPlayerClient && (member.role === "Lead" || member.role === "Series Regular" || member.role === "Co-lead")) return "negotiate";
  if (member.role === "Guest Star") return "drop";
  return "stay";
}

export function applyStay(state: GameState, project: Project, member: CastMember, season: Season): void {
  const bump = member.seriesDeal?.annualBump ?? 0.08;
  const base = member.seriesDeal?.episodeFee ?? member.episodeFee ?? Math.max(5_000, Math.round(member.fee / Math.max(1, season.episodes)));
  const served = member.seriesDeal ? member.seriesDeal.seasonsServed : 1;
  const nextFee = bumpedFee(base, bump, member.seriesDeal ? served : 1);
  if (member.seriesDeal && member.seriesDeal.style === "guaranteed") member.seriesDeal.seasonsServed += 1;
  if (member.seriesDeal) member.seriesDeal.episodeFee = nextFee;
  member.episodeFee = nextFee;
  member.episodes = member.role === "Guest Star" ? Math.min(2, season.episodes) : member.role === "Recurring" ? Math.max(1, Math.round(season.episodes / 2)) : season.episodes;
  member.fee = nextFee * member.episodes;
  member.seasonNumber = member.seasonNumber ?? 1;
  const rng = sideRng(state, 40 + member.personId + season.number);
  member.blocks = buildBlocks(member.role, season, rng);
  member.episodesPaid = 0;
  if (member.isPlayerClient && member.seriesDeal?.style === "guaranteed") {
    const client = state.clients.find((row) => row.personId === member.personId);
    note(
      state,
      "offer",
      `${client?.name ?? member.name} stays on ${project.title}`,
      `Season ${season.number} is inside the guarantee. Fee is $${nextFee.toLocaleString("en-US")} an episode. The calendar stays locked.`,
      `/projects/${project.id}`,
    );
  }
}

export function renewalQuote(state: GameState, client: Client, project: Project, member: CastMember, season: Season) {
  const quote = episodeQuote({
    fame: client.fame,
    role: member.role,
    medium: client.medium,
    filmStar: client.filmStar,
    tvStar: client.tvStar,
    season: season.number,
    episodes: season.episodes,
    format: project.format,
  });
  const current = member.episodeFee ?? quote.episodeFee;
  const episodeFee = Math.max(quote.episodeFee, bumpedFee(current, member.seriesDeal?.annualBump ?? 0.08, 1));
  const rng = sideRng(state, 70 + client.personId + season.number);
  const seasons = member.seriesDeal && member.seriesDeal.style !== "single" ? member.seriesDeal.seasons : [1, 3, 5][int(rng, 0, 2)]!;
  const style = seasons === 1 ? "single" : member.seriesDeal?.style === "guaranteed" ? "guaranteed" : "option";
  return {
    episodeFee,
    episodes: quote.episodes,
    total: episodeFee * quote.episodes,
    deal: { style, seasons, annualBump: member.seriesDeal?.annualBump ?? 0.08 } as const,
    blocks: buildBlocks(member.role, { ...season, episodes: quote.episodes }, rng),
    willingness: `${quote.willingness} ${dealBlurb({ style, seasons, annualBump: member.seriesDeal?.annualBump ?? 0.08 })}`,
  };
}

export function payReleaseExtras(state: GameState, project: Project): void {
  if (project.kind !== "film") return;
  for (const member of project.cast) {
    if (!member.isPlayerClient) continue;
    const client = clientOf(state, member.personId);
    if (!client?.contract) continue;
    const weight = member.role === "Lead" || member.role === "Co-lead" ? 1 : 0.45;
    client.filmStar = Math.max(1, Math.min(99, client.filmStar + growFilmStar(client, project.budgetTier, project.profitLabel, weight)));
    if (project.budgetTier === "tentpole" && (project.profitLabel === "flop" || project.profitLabel === "bomb")) {
      client.stats.buzz = Math.max(1, client.stats.buzz - 8);
      client.stats.reputation = Math.max(1, client.stats.reputation - 5);
      client.statWhy.buzz = `${project.title} missed as a tentpole. Buzz and reputation took the extra hit.`;
    }
  }
}

export function considerFranchise(state: GameState, project: Project): void {
  if (project.kind !== "film" || project.budgetTier !== "tentpole") return;
  if (project.profitLabel !== "hit" && project.profitLabel !== "blockbuster") return;
  const lead = project.cast.find((member) => member.isPlayerClient && member.active && (member.role === "Lead" || member.role === "Co-lead"));
  if (!lead) return;
  const client = state.clients.find((row) => row.personId === lead.personId && row.agency === "player");
  if (!client || (client.fame !== "A-list" && client.fame !== "Icon")) return;
  if (client.franchises.some((lock) => lock.id === (project.franchiseId ?? project.id))) return;
  const rng = sideRng(state, 77 + saltOf(project.id));
  if (!chance(rng, 0.72)) return;
  const count = int(rng, 2, 4);
  let fee = Math.max(lead.fee, Math.round(lead.fee * (1.1 + client.filmStar / 200)));
  const films = [];
  for (let number = 2; number <= count + 1; number++) {
    const prep = addWeeks(project.release, 36 + (number - 2) * 78);
    films.push({ number, prep, shootWeeks: project.shootWeeks, fee, status: "held" as const });
    state.holds.push({
      id: `hold_${++state.seq}`,
      personId: client.personId,
      start: prep,
      end: addWeeks(prep, project.shootWeeks + 3),
      reason: `${project.title} franchise film ${number}`,
      kind: "franchise",
      projectId: `fr_${project.franchiseId ?? project.id}_${number}`,
    });
    fee = Math.round(fee * 1.25);
  }
  client.franchises.push({ id: project.franchiseId ?? project.id, title: project.title, films });
  note(
    state,
    "offer",
    `${client.name} is locked to ${project.title}`,
    `${films.length} more pictures, fees stepping up from the first sequel. The dates are on the calendar as franchise holds.`,
    `/actors/${client.personId}?tab=schedule`,
  );
}
