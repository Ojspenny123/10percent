import { acceptOffer, applyEventChoice, book, bumpRep, closeApproachInbox, closeInbox, declineOffer, pushApproach, tierBias } from "./actions";
import {
  buildBlocks,
  dealBlurb,
  episodeQuote,
  inPilotSeason,
  migrateCareer,
  offerKindBias,
  pickDeal,
  seriesPremium,
  sideRng,
} from "./career";
import {
  applyStay,
  considerFranchise,
  offerSalt,
  payCancellation,
  payReleaseExtras,
  payShootCommissions,
  renewalMove,
  renewalQuote,
  resolvePilotDecisions,
} from "./deals";
import { BRANDS, CEREMONIES, GENRES, STAFF_INFO, STREAMERS } from "./constants";
import { headline } from "./copy";
import {
  genreTotal,
  livingActors,
  nextId,
  roleForClient,
  spawnFilm,
  spawnSeries,
  tierForClient,
} from "./generate";
import { quotePackage } from "./money";
import { advanceMoney, applySleeper, resolveInsolvency, scheduleTalentPay } from "./productions";
import { cityOf, blocksStudioOffer, markInformationalRead, openDecisions, tickV7, agentPlan } from "./v7";
import { sameCountry } from "./rivals";
import { agencyTier, clamp, clientFromCatalog, expectedFee, fameFromStar, isEligible, traitHints } from "./people";
import { chance, float, int, pick } from "./rng";
import {
  absWeek,
  addWeeks,
  blocksConflict,
  cmpDate,
  formatDate,
  sameDate,
  scheduleConflict,
  shootEnd,
  weeksUntilNextEvent,
} from "./schedule";
import {
  airingDone,
  applyReleaseVerdict,
  applyWrapVerdict,
  decideRenewal,
  decayBuzz,
  pushEpisode,
  scoreFilm,
  shouldWriteOut,
  snapshotHistory,
  startNextSeason,
  updatePeopleForRelease,
} from "./results";
import type {
  AwardNominee,
  AwardRecord,
  CastMember,
  Catalog,
  Client,
  GameState,
  Offer,
  Project,
  RoleType,
  Season,
} from "./types";

export type AdvanceOptions = { stopOnEvent?: boolean; autoResolveEvents?: boolean };

export function advanceWeeks(
  input: GameState,
  catalog: Catalog,
  weeks: number,
  options: AdvanceOptions = {},
): { state: GameState; message: string } {
  const state = structuredClone(input);
  const max = Math.max(1, Math.min(52, Math.round(weeks)));
  let stepped = 0;
  let note = "";
  for (let i = 0; i < max; i++) {
    const paused = stepWeek(state, catalog, options);
    stepped += 1;
    if (paused && options.stopOnEvent) {
      note = "Paused for a decision in the inbox.";
      break;
    }
  }
  return {
    state,
    message: note || `Advanced ${stepped} week${stepped === 1 ? "" : "s"} to ${formatDate(state.date)}.`,
  };
}

export function advanceUntilEvent(input: GameState, catalog: Catalog): { state: GameState; message: string } {
  const horizon = weeksUntilNextEvent(input);
  return advanceWeeks(input, catalog, horizon, { stopOnEvent: true, autoResolveEvents: false });
}

function stepWeek(state: GameState, catalog: Catalog, options: AdvanceOptions): boolean {
  state.date = addWeeks(state.date, 1);
  state.lastTurn = [];
  if (state.date.week === 1) shiftTrends(state);
  decayBuzz(state);
  const scout = state.agency.staff.find((member) => member.role === "scout")?.level ?? 0;
  if (scout > 0) {
    for (const client of state.clients) {
      if (client.agency !== "player") continue;
      const hints = traitHints(client.traits);
      while (client.revealedHints.length < Math.min(scout, hints.length)) {
        const hint = hints.find((item) => !client.revealedHints.includes(item));
        if (!hint) break;
        client.revealedHints.push(hint);
      }
    }
  }
  payOverhead(state);
  advanceMoney(state);
  payShootCommissions(state);
  resolvePilotDecisions(state);
  resolveWraps(state);
  resolveReleases(state, catalog);
  resolveSeries(state);
  expirePaperwork(state);
  resolveFestivals(state);
  runCeremonies(state);
  generateWorld(state, catalog);
  generateOffers(state, catalog);
  generateInbound(state, catalog);
  generateBrands(state);
  offerRegional(state, catalog);
  rivalAct(state, catalog);
  const paused = maybeEvent(state, options);
  writeNews(state);
  snapshotHistory(state);
  trim(state);
  tickV7(state, catalog, Boolean(options.autoResolveEvents));
  if (!options.autoResolveEvents) settleWithAgents(state);
  markInformationalRead(state);
  state.lastAutosave = { ...state.date };
  migrateCareer(state);
  resolveInsolvency(state);
  state.agency.tier = agencyTier(state.agency.reputation);
  if (!options.autoResolveEvents && openDecisions(state).length > 0) return true;
  return paused;
}

function settleWithAgents(state: GameState): void {
  const pending = state.offers.filter((offer) => offer.status === "pending");
  for (const offer of pending) {
    const plan = agentPlan(state, offer);
    if (plan === "escalate") continue;
    const result = plan === "accept" ? acceptOffer(state, offer.id, true) : declineOffer(state, offer.id);
    if (!result.ok) continue;
    copyState(state, result.state);
    state.agentNotes ??= [];
    state.agentNotes.unshift({ date: { ...state.date }, text: result.message });
  }
}

function copyState(live: GameState, next: GameState): void {
  for (const key of Object.keys(next) as (keyof GameState)[]) {
    (live as unknown as Record<string, unknown>)[key] = next[key];
  }
}

function offerRegional(state: GameState, catalog: Catalog): void {
  const city = cityOf(state);
  if (city.hub === "major") return;
  const saved = state.rng;
  state.rng = sideRng(state, 8800 + state.date.year * 52 + state.date.week);
  try {
    if (!chance(state.rng, city.hub === "secondary" ? 0.18 : 0.28)) return;
    const clients = state.clients.filter((client) => client.agency === "player" && client.contract);
    if (!clients.length) return;
    createPlayerOffer(state, catalog, pick(state.rng, clients), "film", true);
  } finally {
    state.rng = saved;
  }
}

function shiftTrends(state: GameState): void {
  const rng = state.rng;
  for (const genre of GENRES) {
    const current = state.genreTrends[genre] ?? 1;
    let value = current * 0.82 + 0.18 + float(rng, -0.08, 0.08);
    if (genre === "Horror") value = Math.max(0.96, value);
    if (genre === "Superhero" && chance(rng, 0.35)) value = Math.min(value, 0.92);
    state.genreTrends[genre] = Math.round(Math.max(0.72, Math.min(1.35, value)) * 100) / 100;
  }
  for (const client of state.clients) {
    for (const studio of Object.keys(client.studioHeat)) {
      client.studioHeat[studio] = Math.max(0, (client.studioHeat[studio] ?? 0) - 1);
    }
  }
  state.lastTurn.push("Genre trends shifted for the new year.");
}

function payOverhead(state: GameState): void {
  if ((state.date.week - 1) % 4 !== 0) return;
  let salaries = 0;
  for (const member of state.agency.staff) {
    salaries += STAFF_INFO[member.role].weekly * member.level * 4;
  }
  const total = state.agency.rent + salaries;
  book(state, -total, "Monthly rent and salaries", "overhead");
  state.lastTurn.push(`Overhead ${total.toLocaleString("en-US")} left the account.`);
}

function resolveWraps(state: GameState): void {
  for (const project of state.projects) {
    if (project.cancelled || project.historical) continue;
    if (project.kind === "film") {
      const wrap = addWeeks(project.shootStart, project.shootWeeks);
      if (sameDate(wrap, state.date)) applyWrapVerdict(state, project, "wrap");
    } else {
      for (const season of project.seasons) {
        const wrap = addWeeks(season.shootStart, season.shootWeeks);
        if (sameDate(wrap, state.date)) applyWrapVerdict(state, project, "season");
      }
    }
  }
}

function resolveReleases(state: GameState, catalog: Catalog): void {
  for (const project of state.projects) {
    if (project.kind !== "film" || project.cancelled || project.ended || project.historical) continue;
    if (!sameDate(project.release, state.date)) continue;
    if (project.openRole) project.openRole = null;
    if (project.cast.length === 0) {
      project.cancelled = true;
      continue;
    }
    scoreFilm(state, project);
    applySleeper(state, project);
    updatePeopleForRelease(state, project);
    payReleaseExtras(state, project);
    scheduleTalentPay(state, project);
    considerFranchise(state, project);
    applyReleaseVerdict(state, project);
    const gross = project.totalGross ?? 0;
    state.news.unshift({
      id: `news_${++state.seq}`,
      date: { ...state.date },
      headline: headline(state.rng, "release", project.title),
      body: `${project.title} ${project.profitLabel ?? "opened"} with ${Math.round(gross).toLocaleString("en-US")} worldwide. Critics: ${project.criticScore}.`,
    });
    state.lastTurn.push(`${project.title} released (${project.profitLabel}).`);
    maybeSequel(state, catalog, project);
  }
}

function maybeSequel(state: GameState, catalog: Catalog, project: Project): void {
  if (project.sequelNumber >= 3) return;
  if (project.profitLabel !== "hit" && project.profitLabel !== "blockbuster") return;
  if (!project.playerInvolved || !chance(state.rng, 0.55)) return;
  const member = project.cast.find((c) => c.isPlayerClient && c.active && !c.writtenOut && (c.role === "Lead" || c.role === "Co-lead"));
  if (!member) return;
  const client = state.clients.find((c) => c.personId === member.personId && c.agency === "player");
  if (!client) return;
  const subtitle = ["Reckoning", "Afterlight", "Return", "Chapter Two", "The Long Way"][int(state.rng, 0, 4)];
  const title = project.title.includes(":") ? `${project.title} II` : `${project.title}: ${subtitle}`;
  const sequel = spawnFilm(state, catalog, {
    genre: project.genres[0],
    sequelTitle: title,
    franchiseId: project.franchiseId ?? project.id,
    sequelNumber: project.sequelNumber + 1,
    forceTier: project.budgetTier,
    openFor: { client, role: member.role, billing: member.billing },
    excludePeople: new Set(playerIds(state)),
  });
  if (!sequel) return;
  if (scheduleConflict(state, client.personId, sequel.prepStart, shootEnd(sequel), sequel.id)) {
    dropProject(state, sequel);
    return;
  }
  pushOffer(state, sequel, client, member.role, member.billing);
  state.lastTurn.push(`Sequel offer: ${title} for ${client.name}.`);
}

function resolveSeries(state: GameState): void {
  for (const project of state.projects) {
    if (project.kind !== "series" || project.cancelled) continue;
    if (project.pilot && project.pilot.status !== "picked_up") continue;
    const season = project.seasons[project.seasons.length - 1];
    if (!season || season.renewal === "cancelled") continue;
    const premiereAbs = season.premiere.year * 52 + (season.premiere.week - 1);
    const now = state.date.year * 52 + (state.date.week - 1);
    if (now < premiereAbs) continue;
    if (season.episodesAired < season.episodes) {
      if (season.schedule === "binge" && now === premiereAbs) {
        while (season.episodesAired < season.episodes) pushEpisode(state, project, season);
      } else if (season.schedule === "weekly") {
        pushEpisode(state, project, season);
      }
    }
    if (!airingDone(season, now) || season.renewal !== "pending") continue;
    if (season.schedule === "weekly" && now < premiereAbs + season.episodes) continue;
    const strategy = STREAMERS.find((s) => s.name === project.network)?.strategy ?? 0;
    const outcome = decideRenewal({
      format: project.format,
      viewership: season.viewership,
      critic: season.criticScore ?? project.criticScore ?? 55,
      budget: project.budget,
      strategy,
      rng: state.rng,
    });
    season.renewal = outcome;
    project.phase = outcome === "cancelled" ? "ended" : "hiatus";
    const avg = season.viewership.reduce((s, n) => s + n, 0) / Math.max(1, season.viewership.length);
    state.news.unshift({
      id: `news_${++state.seq}`,
      date: { ...state.date },
      headline: `${project.title} is ${outcome === "renewed" ? "renewed" : outcome === "renewed_short" ? "renewed, shorter" : outcome === "finale" ? "ending" : "cancelled"}`,
      body: `Season ${season.number} averaged ${Math.round(avg / 1000) / 10}M viewers. Critics ${season.criticScore ?? "—"}.`,
    });
    state.lastTurn.push(`${project.title}: ${outcome.replace("_", " ")}.`);
    if (outcome === "renewed" || outcome === "renewed_short") {
      for (const member of project.cast) {
        if (!member.active || member.writtenOut) continue;
        if (shouldWriteOut(state.rng, member, project.format, outcome)) {
          member.writtenOut = true;
          member.active = false;
          const client = state.clients.find((c) => c.personId === member.personId && c.agency === "player");
          if (client) {
            client.loyalty = clamp(client.loyalty - 5, 1, 99);
            client.mood = "Uneasy";
            inbox(state, "system", `${client.name} is written out of ${project.title}`, "The show is coming back. Their character is not. Loyalty took a hit.");
          }
        }
      }
      const players = project.cast.filter((c) => c.isPlayerClient && c.active && !c.writtenOut);
      if (players.length === 0) project.playerInvolved = false;
      const nextSeason = startNextSeason(state, project, outcome === "renewed_short");
      for (const member of project.cast) {
        if (!member.active || member.writtenOut) continue;
        const clash = scheduleConflict(
          state,
          member.personId,
          nextSeason.prepStart,
          addWeeks(nextSeason.shootStart, Math.max(1, nextSeason.shootWeeks) - 1),
          project.id,
        );
        if (!clash) continue;
        member.writtenOut = true;
        member.active = false;
        const client = state.clients.find((c) => c.personId === member.personId && c.agency === "player");
        if (client) {
          client.mood = "Uneasy";
          inbox(state, "system", `${client.name} can't return for ${project.title}`, clash.message);
        }
      }
      for (const member of project.cast) {
        if (!member.active || member.writtenOut) continue;
        const move = renewalMove(state, member, nextSeason.number);
        if (move === "drop") {
          member.writtenOut = true;
          member.active = false;
          const client = state.clients.find((c) => c.personId === member.personId && c.agency === "player");
          if (client) inbox(state, "offer", `${client.name} is off ${project.title}`, "The studio dropped the option, or the role was not brought back.", `/projects/${project.id}`);
          continue;
        }
        if (move === "negotiate") {
          member.active = false;
          const client = state.clients.find((c) => c.personId === member.personId && c.agency === "player");
          if (client) pushRenewal(state, project, client, member, nextSeason);
          continue;
        }
        applyStay(state, project, member, nextSeason);
      }
    } else {
      project.ended = true;
      for (const member of project.cast) {
        payCancellation(state, project, member, season.episodes);
        member.active = false;
      }
      state.holds = state.holds.filter((hold) => hold.projectId !== project.id);
    }
  }
}

function expirePaperwork(state: GameState): void {
  for (const offer of state.offers) {
    if (offer.status !== "pending") continue;
    if (cmpDate(offer.expires, state.date) > 0) continue;
    offer.status = "expired";
    closeInbox(state, offer.id);
    const project = state.projects.find((p) => p.id === offer.projectId);
    if (project?.openRole?.forPersonId === offer.personId) project.openRole = null;
    const client = state.clients.find((c) => c.personId === offer.personId);
    inbox(state, "offer", `Offer expired: ${project?.title ?? "a project"}`, `${client?.name ?? "Your client"} did not answer ${offer.studio} in time.`, `/offers?offer=${offer.id}&status=expired`);
  }
  for (const approach of state.approaches) {
    if (approach.status !== "pending") continue;
    if (cmpDate(approach.expires, state.date) >= 0) continue;
    approach.status = "expired";
    closeApproachInbox(state, approach);
    inbox(state, "approach", `${approach.name} let the meeting lapse`, `They stopped waiting on ${formatDate(approach.expires)}.`, `/meetings/${approach.id}`);
  }
  for (const client of [...state.clients]) {
    if (client.agency !== "player" || !client.contract) continue;
    const end = addWeeks(client.contract.start, client.contract.termYears * 52);
    const weeks = end.year * 52 + (end.week - 1) - (state.date.year * 52 + (state.date.week - 1));
    if (weeks === 8) inbox(state, "system", `${client.name}'s contract is close`, "Eight weeks left. Renew them from Contracts before they walk.", `/actors/${client.personId}?tab=contract`);
    if (weeks <= 0) {
      client.agency = "unsigned";
      client.rivalId = null;
      client.contract = null;
      bumpRep(state, -1);
      inbox(state, "system", `${client.name}'s contract ended`, "They are unsigned again. Their file, including verdicts, stays in the office.", `/actors/${client.personId}`);
    }
  }
  for (const project of state.projects) {
    if (!project.openRole) continue;
    const still = state.offers.some((o) => o.projectId === project.id && o.status === "pending");
    if (still) continue;
    if (cmpDate(project.prepStart, state.date) <= 0) {
      project.openRole = null;
      if (project.cast.length === 0) project.cancelled = true;
    }
  }
}

function resolveFestivals(state: GameState): void {
  for (const fest of state.festivals) {
    if (fest.status !== "submitted") continue;
    const ceremony = CEREMONIES.find((c) => c.id === fest.festivalId);
    if (!ceremony || ceremony.week !== state.date.week) continue;
    const project = state.projects.find((p) => p.id === fest.projectId);
    if (!project) {
      fest.status = "declined";
      continue;
    }
    const lead = project.cast.reduce((best, c) => Math.max(best, c.talent), 40);
    const score = project.scriptQuality * 0.5 + project.directorAcclaim * 0.3 + lead * 0.2 + float(state.rng, -8, 8);
    if (score >= 62) {
      fest.status = "premiered";
      if (score >= 82) fest.prize = `${fest.festival} jury mention`;
      for (const member of project.cast) {
        if (!member.isPlayerClient) continue;
        const client = state.clients.find((c) => c.personId === member.personId);
        if (!client) continue;
        client.stats.buzz = clamp(client.stats.buzz + 12, 1, 99);
        if (fest.prize) client.stats.talent = clamp(client.stats.talent + 1, 1, 99);
      }
      inbox(state, "award", `${project.title} plays ${fest.festival}`, fest.prize ?? "Accepted. Buzz is up with the cast.", "/awards");
    } else {
      fest.status = "declined";
      inbox(state, "news", `${fest.festival} passed on ${project.title}`, "The programmers went another way.", "/news");
    }
  }
}

function runCeremonies(state: GameState): void {
  for (const ceremony of CEREMONIES) {
    if (ceremony.week !== state.date.week) continue;
    if (ceremony.kind === "festival") continue;
    const key = `${ceremony.id}:${state.date.year}`;
    if (state.ceremoniesRun.includes(key)) continue;
    state.ceremoniesRun.push(key);
    if (ceremony.kind === "razzie") runRazzies(state, ceremony.name);
    else if (ceremony.kind === "tv") runTvAwards(state, ceremony.id, ceremony.name);
    else {
      runFilmAwards(state, ceremony.id, ceremony.name);
      if (ceremony.kind === "film_tv") runTvAwards(state, ceremony.id, ceremony.name);
    }
  }
}

function eligibleFilms(state: GameState): Project[] {
  return state.projects.filter((p) => p.kind === "film" && p.ended && !p.cancelled && p.release.year === state.date.year - 1 && (p.criticScore ?? 0) > 0);
}

function filmScore(project: Project, talent = 50): number {
  const late = project.release.week >= 40 ? 8 : project.release.week >= 32 ? 4 : 0;
  const campaign = Math.min(14, project.fycSpend / 120_000);
  return (project.criticScore ?? 50) * 0.42 + project.prestige * 0.22 + talent * 0.2 + (project.audienceScore ?? 50) * 0.08 + late + campaign;
}

function handOut(state: GameState, ceremonyId: string, ceremony: string, category: string, ranked: AwardNominee[], scores: number[]): void {
  if (ranked.length === 0) return;
  const jittered = scores.map((score, i) => score + float(state.rng, 0, 4) - i * 0.01);
  let winnerIndex = 0;
  for (let i = 1; i < jittered.length; i++) if ((jittered[i] ?? 0) > (jittered[winnerIndex] ?? 0)) winnerIndex = i;
  const record: AwardRecord = {
    id: `aw_${++state.seq}`,
    ceremonyId,
    ceremony,
    year: state.date.year,
    category,
    nominees: ranked.slice(0, 5),
    winnerIndex,
  };
  state.awards.unshift(record);
  const winner = record.nominees[winnerIndex];
  if (!winner) return;
  if (winner.personId) {
    const client = state.clients.find((c) => c.personId === winner.personId);
    if (client) grantAward(state, client, ceremony, category, "won", winner.title);
    for (const nominee of record.nominees) {
      if (!nominee.personId || nominee.personId === winner.personId) continue;
      const other = state.clients.find((c) => c.personId === nominee.personId);
      if (other) grantAward(state, other, ceremony, category, "nominated", nominee.title);
    }
  }
  const playerNom = record.nominees.some((n) => n.personId && state.clients.some((c) => c.personId === n.personId && c.agency === "player"));
  if (playerNom) {
    inbox(state, "award", `${ceremony}: ${category}`, `${winner.name} wins. ${record.nominees.map((n) => n.name).join(", ")} were nominated.`, "/awards");
  }
  state.news.unshift({
    id: `news_${++state.seq}`,
    date: { ...state.date },
    headline: `${ceremony}: ${winner.name} wins ${category}`,
    body: record.nominees.map((n) => n.title).join(" · "),
  });
}

function grantAward(state: GameState, client: Client, ceremony: string, category: string, result: "nominated" | "won", projectTitle: string): void {
  client.awards.unshift({ ceremony, category, result, year: state.date.year, projectTitle });
  if (result === "won") {
    client.stats.starPower = clamp(client.stats.starPower + 6, 1, 99);
    client.stats.buzz = clamp(client.stats.buzz + 16, 1, 99);
    client.stats.talent = clamp(client.stats.talent + 2, 1, 99);
    client.loyalty = clamp(client.loyalty + 4, 1, 99);
    client.mood = "Thrilled";
    const wins = client.awards.filter((a) => a.result === "won").length;
    client.fame = fameFromStar(client.stats.starPower, wins);
    bumpRep(state, 3);
    client.statWhy.starPower = `${ceremony} win for ${category} lifted star power.`;
  } else {
    client.stats.buzz = clamp(client.stats.buzz + 8, 1, 99);
    bumpRep(state, 1);
  }
}

function runFilmAwards(state: GameState, id: string, name: string): void {
  const films = eligibleFilms(state).sort((a, b) => filmScore(b) - filmScore(a)).slice(0, 8);
  if (films.length === 0) return;
  handOut(
    state,
    id,
    name,
    "Best Picture",
    films.slice(0, 5).map((p) => ({ projectId: p.id, name: p.title, title: p.title })),
    films.slice(0, 5).map((p) => filmScore(p)),
  );
  const directors = films.slice(0, 5).map((p) => ({ projectId: p.id, name: p.directorName, title: p.title }));
  handOut(state, id, name, "Best Director", directors, films.slice(0, 5).map((p) => filmScore(p, p.directorAcclaim)));
  performanceCategories(state, id, name, films, "Lead");
  performanceCategories(state, id, name, films, "Supporting");
}

function performanceCategories(state: GameState, id: string, name: string, films: Project[], slot: "Lead" | "Supporting"): void {
  const roles = slot === "Lead" ? ["Lead", "Co-lead", "Series Regular"] : ["Supporting", "Recurring"];
  const buckets: Record<"actor" | "actress" | "open", { nominee: AwardNominee; score: number }[]> = { actor: [], actress: [], open: [] };
  for (const project of films) {
    for (const member of project.cast) {
      if (!roles.includes(member.role) || member.writtenOut) continue;
      const nominee = { projectId: project.id, personId: member.personId, name: member.name, title: project.title };
      buckets[member.awardTrack].push({ nominee, score: filmScore(project, member.talent) });
    }
  }
  const label = slot === "Lead" ? "Lead" : "Supporting";
  awardBucket(state, id, name, `Best ${label} Actor`, buckets.actor);
  awardBucket(state, id, name, `Best ${label} Actress`, buckets.actress);
  awardBucket(state, id, name, `Best ${label} Performance`, buckets.open);
}

function awardBucket(state: GameState, id: string, name: string, category: string, rows: { nominee: AwardNominee; score: number }[]): void {
  const sorted = rows.sort((a, b) => b.score - a.score).slice(0, 5);
  handOut(state, id, name, category, sorted.map((r) => r.nominee), sorted.map((r) => r.score));
}

function runTvAwards(state: GameState, id: string, name: string): void {
  const series = state.projects.filter((p) => p.kind === "series" && p.seasons.some((s) => s.viewership.length > 0 && (s.premiere.year === state.date.year || s.premiere.year === state.date.year - 1)));
  const dramas = series.filter((p) => p.format === "ongoing_drama" || p.format === "streaming");
  const comedies = series.filter((p) => p.format === "sitcom");
  const limited = series.filter((p) => p.format === "limited" || p.format === "miniseries" || p.format === "anthology");
  const pack = (list: Project[]) =>
    list
      .map((p) => ({ project: p, score: (p.criticScore ?? 50) + Math.min(20, p.fycSpend / 100_000) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  for (const [label, list] of [
    ["Best Drama Series", dramas],
    ["Best Comedy Series", comedies],
    ["Best Limited Series", limited],
  ] as const) {
    const ranked = pack(list);
    handOut(state, id, name, label, ranked.map((r) => ({ projectId: r.project.id, name: r.project.title, title: r.project.title })), ranked.map((r) => r.score));
  }
  performanceCategories(state, id, name, series.slice(0, 10), "Lead");
}

function runRazzies(state: GameState, name: string): void {
  const bombs = eligibleFilms(state)
    .filter((p) => (p.criticScore ?? 100) < 45 || p.profitLabel === "bomb" || p.profitLabel === "flop")
    .sort((a, b) => (a.criticScore ?? 50) - (b.criticScore ?? 50))
    .slice(0, 5);
  if (bombs.length === 0) return;
  handOut(
    state,
    "razzies",
    name,
    "Worst Picture",
    bombs.map((p) => ({ projectId: p.id, name: p.title, title: p.title })),
    bombs.map((p) => 100 - (p.criticScore ?? 50)),
  );
}

function generateWorld(state: GameState, catalog: Catalog): void {
  const exclude = new Set(playerIds(state));
  if (chance(state.rng, 0.84)) spawnFilm(state, catalog, { excludePeople: exclude });
  if (chance(state.rng, 0.2)) {
    const before = state.projects.length;
    spawnSeries(state, catalog, { excludePeople: exclude });
    const created = state.projects.length > before ? state.projects[state.projects.length - 1] : undefined;
    if (created) stampWorldSeries(state, created);
  }
}

function generateOffers(state: GameState, catalog: Catalog): void {
  const agent = state.agency.staff.find((s) => s.role === "junior_agent")?.level ?? 0;
  for (const client of state.clients) {
    if (client.agency !== "player" || !client.contract) continue;
    const pending = state.offers.filter((o) => o.personId === client.personId && o.status === "pending").length;
    if (pending >= 2) continue;
    if (client.primaryFocus === "Director") {
      const side = sideRng(state, 990 + client.personId + state.date.week);
      if (!chance(side, 0.22)) continue;
    }
    const fameP = { Unknown: 0.12, Working: 0.18, Known: 0.28, "A-list": 0.4, Icon: 0.48 }[client.fame];
    const p = Math.min(0.8, fameP + client.stats.buzz / 350 + state.agency.reputation / 450 + agent * 0.06 + tierBias(client.fame === "Icon" ? "tentpole" : "mid") * 0);
    if (!chance(state.rng, p)) continue;
    createPlayerOffer(state, catalog, client);
    maybeSideOffer(state, catalog, client);
  }
  materializeFranchises(state, catalog);
}

function withSide<T>(state: GameState, salt: number, fn: () => T): T {
  const saved = state.rng;
  state.rng = sideRng(state, salt);
  try {
    return fn();
  } finally {
    state.rng = saved;
  }
}

function maybeSideOffer(state: GameState, catalog: Catalog, client: Client): void {
  const pending = state.offers.filter((offer) => offer.personId === client.personId && offer.status === "pending").length;
  if (pending >= 2) return;
  const volume = client.medium === "Both" ? 0.38 : client.medium === "TV" ? 0.16 : 0.05;
  withSide(state, 300 + client.personId + state.date.week, () => {
    if (!chance(state.rng, volume)) return;
    const kind = chance(state.rng, offerKindBias(client)) ? "film" : "series";
    createPlayerOffer(state, catalog, client, kind);
  });
}

function createPlayerOffer(state: GameState, catalog: Catalog, client: Client, forcedKind?: "film" | "series", regional = false): void {
  const rng = state.rng;
  const kind = forcedKind ?? (client.fame === "Icon" ? "film" : chance(rng, 0.24) ? "series" : "film");
  const slot = roleForClient(rng, client, kind);
  for (let attempt = 0; attempt < 4; attempt++) {
    const total = genreTotal(state);
    let genre = preferredGenreOrBalance(state, client);
    if ((state.genreTallies[genre] ?? 0) / Math.max(1, total) > 0.14) {
      genre = GENRES.find((g) => (state.genreTallies[g] ?? 0) / Math.max(1, total) < 0.1) ?? genre;
    }
    const project =
      kind === "series"
        ? spawnSeries(state, catalog, { genre, openFor: { client, role: slot.role, billing: slot.billing }, excludePeople: new Set(playerIds(state)) })
        : spawnFilm(state, catalog, {
            genre,
            openFor: { client, role: slot.role, billing: slot.billing },
            excludePeople: new Set(playerIds(state)),
            forceTier: regional ? "indie" : tierForClient(client, genre),
          });
    if (!project) continue;
    if (regional) {
      const city = cityOf(state);
      project.logline = `${city.city} production. ${project.logline}`;
      project.studio = city.studio;
    } else if (blocksStudioOffer(state, project.budgetTier, client.filmStar)) {
      dropProject(state, project);
      continue;
    }
    const conflict = scheduleConflict(state, client.personId, project.prepStart, shootEnd(project), project.id);
    if (conflict) {
      dropProject(state, project);
      continue;
    }
    pushOffer(state, project, client, slot.role, slot.billing);
    return;
  }
}

function preferredGenreOrBalance(state: GameState, client: Client): string {
  const total = Math.max(1, genreTotal(state));
  const preferred = client.preferredGenres.find((g) => (state.genreTallies[g] ?? 0) / total < 0.12);
  if (preferred && chance(state.rng, 0.5)) return preferred;
  const missing = GENRES.find((g) => !(state.genreTallies[g] ?? 0));
  if (missing && genreTotal(state) > 10 && chance(state.rng, 0.35)) return missing;
  const weights = GENRES.map((g) => 1 / (1 + (state.genreTallies[g] ?? 0)));
  let roll = float(state.rng, 0, weights.reduce((s, n) => s + n, 0));
  for (let i = 0; i < GENRES.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return GENRES[i]!;
  }
  return "Drama";
}

function pushOffer(state: GameState, project: Project, client: Client, role: RoleType, billing: number): void {
  const agent = state.agency.staff.find((s) => s.role === "junior_agent")?.level ?? 0;
  const base = expectedFee(client.fame, role, project.budgetTier);
  const fee = Math.max(5_000, Math.round((base * (0.92 + agent * 0.05) * (0.9 + client.stats.reputation / 700)) / 1000) * 1000);
  const lawyer = state.agency.staff.find((s) => s.role === "lawyer")?.level ?? 0;
  const heat = client.studioHeat[project.studio] ?? 0;
  const generosity = 1.18 + float(state.rng, 0, 0.28) + lawyer * 0.06 + client.stats.reputation / 500 - heat * 0.05;
  const expiresCandidate = addWeeks(state.date, int(state.rng, 2, 5));
  const latest = addWeeks(project.prepStart, -1);
  const expires = cmpDate(expiresCandidate, latest) > 0 ? latest : expiresCandidate;
  if (cmpDate(expires, state.date) <= 0) {
    dropProject(state, project);
    return;
  }
  const offer: Offer = {
    id: nextId(state, "off"),
    projectId: project.id,
    personId: client.personId,
    role,
    character: project.openRole?.character ?? "TBD",
    fee,
    billing,
    backend: role === "Lead" || role === "Series Regular" ? int(state.rng, 0, 3) : 0,
    prestige: project.prestige,
    risk: project.risk,
    feeWhy: `Quote starts from ${client.fame} ${role} rates on a ${project.budgetTier} package, then nudges for reputation ${client.stats.reputation}${agent ? ` and your junior agents` : ""}.`,
    prestigeWhy: `Prestige leans on ${project.genres[0]} and ${project.directorName}'s acclaim (${project.directorAcclaim}).`,
    riskWhy: `Risk is the chance this dents buzz: script note "${project.scriptNote}" and a ${project.budgetTier} budget.`,
    scriptNote: project.scriptNote,
    expires,
    status: "pending",
    walkAwayFee: Math.round(fee * Math.max(1.08, generosity)),
    walkAwayBackend: Math.min(8, 2 + (lawyer > 0 ? 2 : 1)),
    minBilling: client.stats.starPower >= 76 ? 1 : Math.max(1, billing - 1),
    dateFlexible: chance(state.rng, 0.28),
    perkAvailable: chance(state.rng, lawyer > 0 ? 0.45 : 0.22),
    perk: null,
    dateShiftWeeks: 0,
    studio: project.studio,
    created: { ...state.date },
  };
  dressOffer(state, offer, project, client, role);
  state.offers.unshift(offer);
  const money = offer.pay === "episode" && offer.episodeFee
    ? `$${offer.episodeFee.toLocaleString("en-US")}/ep × ${offer.episodes} · $${offer.fee.toLocaleString("en-US")}`
    : `$${offer.fee.toLocaleString("en-US")}`;
  inbox(state, "offer", `Offer: ${client.name} in ${project.title}`, `${role}, ${money}, ${project.genres[0]}. Expires ${formatDate(expires)}.`, `/offers?offer=${offer.id}`, offer.id);
}

function dressOffer(state: GameState, offer: Offer, project: Project, client: Client, role: RoleType): void {
  const quoted = offer.fee;
  if (project.kind === "film") {
    const priced = quotePackage({
      fame: client.fame,
      role,
      tier: project.budgetTier,
      filmStar: client.filmStar,
      genre: project.genres[0] ?? "Drama",
    });
    offer.fee = priced.fee;
    offer.backend = priced.points;
    offer.backendStyle = priced.style;
    offer.bonuses = priced.bonuses;
    offer.earningsLow = priced.low;
    offer.earningsHigh = priced.high;
    offer.pay = "flat";
    offer.feeWhy = priced.why;
  } else {
    const season = project.seasons[project.seasons.length - 1];
    if (!season) return;
    const rng = sideRng(state, offerSalt(project.id, client.personId));
    const pilotish = season.number === 1
      && !offer.renewal
      && inPilotSeason(state.date)
      && (project.format === "ongoing_drama" || project.format === "sitcom")
      && chance(rng, client.medium === "Film" ? 0.35 : 0.62);
    const quote = episodeQuote({
      fame: client.fame,
      role,
      medium: client.medium,
      filmStar: client.filmStar,
      tvStar: client.tvStar,
      season: season.number,
      episodes: season.episodes,
      format: project.format,
    });
    if (pilotish) {
      const pilotFee = Math.max(25_000, Math.round((quote.episodeFee * 1.35) / 1000) * 1000);
      const deal = pickDeal(rng, role, project.format);
      offer.pay = "pilot";
      offer.fee = pilotFee;
      offer.episodeFee = quote.episodeFee;
      offer.episodes = 1;
      offer.seasonNumber = 1;
      offer.blocks = [{ start: { ...season.shootStart }, weeks: 2, episodes: 1 }];
      offer.deal = deal;
      offer.willingness = `Pilot fee, then a series option: ${dealBlurb(deal)} Option episode fee $${quote.episodeFee.toLocaleString("en-US")}.`;
      project.origin = "pilot";
      project.pilot = {
        status: "awaiting",
        decision: addWeeks(season.shootStart, 6),
        optionSeasons: deal.seasons,
        optionRole: role,
        optionFee: quote.episodeFee,
        optionEpisodes: season.episodes,
      };
      offer.feeWhy = `Pilot money, separate from the series option. Film-star premium on the option is ${seriesPremium(client).toFixed(2)}× a TV base.`;
    } else {
      const deal = pickDeal(rng, role, project.format);
      const blocks = buildBlocks(role, season, sideRng(state, offerSalt(project.id, client.personId) + 3));
      offer.pay = "episode";
      offer.episodeFee = quote.episodeFee;
      offer.episodes = quote.episodes;
      offer.seasonNumber = season.number;
      offer.fee = quote.total;
      offer.deal = deal;
      offer.blocks = blocks;
      offer.willingness = `${quote.willingness} ${dealBlurb(deal)}`;
      offer.feeWhy = `$${quote.episodeFee.toLocaleString("en-US")} × ${quote.episodes} episodes, season ${season.number}. ${client.medium} star power TV ${client.tvStar} / film ${client.filmStar}.`;
      if (!project.origin) project.origin = project.format === "limited" || project.format === "miniseries" ? "limited" : "straight";
    }
  }
  if (quoted > 0) offer.walkAwayFee = Math.max(offer.fee, Math.round(offer.walkAwayFee * (offer.fee / quoted)));
}

function pushRenewal(state: GameState, project: Project, client: Client, member: CastMember, season: Season): void {
  const quote = renewalQuote(state, client, project, member, season);
  const expires = addWeeks(state.date, 3);
  const offer: Offer = {
    id: nextId(state, "off"),
    projectId: project.id,
    personId: client.personId,
    role: member.role,
    character: member.character,
    fee: quote.total,
    billing: member.billing,
    backend: member.backend,
    prestige: project.prestige,
    risk: project.risk,
    feeWhy: `Renewal for season ${season.number}. $${quote.episodeFee.toLocaleString("en-US")} an episode.`,
    prestigeWhy: project.genres[0] ?? "Series",
    riskWhy: "Walking away ends the run. A long guarantee locks the calendar.",
    scriptNote: project.scriptNote,
    expires,
    status: "pending",
    walkAwayFee: Math.round(quote.total * 1.35),
    walkAwayBackend: member.backend,
    minBilling: member.billing,
    dateFlexible: false,
    perkAvailable: false,
    perk: null,
    dateShiftWeeks: 0,
    studio: project.studio,
    created: { ...state.date },
    pay: "episode",
    episodeFee: quote.episodeFee,
    episodes: quote.episodes,
    seasonNumber: season.number,
    deal: quote.deal,
    blocks: quote.blocks,
    willingness: quote.willingness,
    renewal: true,
  };
  state.offers.unshift(offer);
  inbox(
    state,
    "offer",
    `Renewal: ${client.name} on ${project.title}`,
    `Season ${season.number}. $${quote.episodeFee.toLocaleString("en-US")} per episode × ${quote.episodes}. ${dealBlurb(quote.deal)} Re-sign, counter, or let them walk.`,
    `/offers?offer=${offer.id}`,
    offer.id,
  );
}

function stampWorldSeries(state: GameState, project: Project): void {
  const season = project.seasons[0];
  if (season) {
    season.producedYear ??= season.shootStart.year;
    season.releasedYear ??= season.premiere.year;
  }
  if (project.format === "limited" || project.format === "miniseries" || project.format === "anthology") {
    project.origin = "limited";
    return;
  }
  project.origin ??= "straight";
  if (project.openRole || !inPilotSeason(state.date)) return;
  if (project.format !== "ongoing_drama" && project.format !== "sitcom") return;
  const rng = sideRng(state, 17 + offerSalt(project.id, season?.episodes ?? 1));
  if (!chance(rng, 0.5)) return;
  project.origin = "pilot";
  project.pilot = {
    status: "awaiting",
    decision: addWeeks(project.shootStart, 3),
    optionSeasons: 3,
    optionRole: "Series Regular",
    optionFee: 40_000,
    optionEpisodes: season?.episodes ?? 10,
  };
}

function materializeFranchises(state: GameState, catalog: Catalog): void {
  for (const client of state.clients) {
    if (client.agency !== "player" || !client.contract) continue;
    for (const lock of client.franchises) {
      for (const film of lock.films) {
        if (film.status !== "held") continue;
        const weeksOut = absWeek(film.prep) - absWeek(state.date);
        if (weeksOut > 16 || weeksOut < 1) continue;
        withSide(state, 900 + client.personId + film.number, () => {
          const project = spawnFilm(state, catalog, {
            sequelTitle: `${lock.title}: Part ${film.number}`,
            franchiseId: lock.id,
            sequelNumber: film.number,
            forceTier: "tentpole",
            openFor: { client, role: "Lead", billing: 1 },
            excludePeople: new Set(playerIds(state)),
          });
          if (!project) return;
          if (blocksConflict(state, client.personId, [{ start: project.prepStart, weeks: Math.max(1, absWeek(shootEnd(project)) - absWeek(project.prepStart) + 1) }], project.id)) {
            dropProject(state, project);
            return;
          }
          film.status = "offered";
          state.holds = state.holds.filter((hold) => !(hold.kind === "franchise" && hold.personId === client.personId && hold.projectId === `fr_${lock.id}_${film.number}`));
          pushOffer(state, project, client, "Lead", 1);
          const offer = state.offers.find((row) => row.projectId === project.id && row.status === "pending");
          if (offer) {
            offer.fee = film.fee;
            offer.walkAwayFee = Math.round(film.fee * 1.2);
            offer.pay = "flat";
            offer.feeWhy = `Franchise film ${film.number}. The fee was agreed when ${lock.title} hit.`;
          }
        });
      }
    }
  }
}

function generateInbound(state: GameState, catalog: Catalog): void {
  const scout = state.agency.staff.find((s) => s.role === "scout")?.level ?? 0;
  const p = 0.08 + state.agency.reputation / 280 + scout * 0.06;
  if (!chance(state.rng, Math.min(0.55, p))) return;
  const taken = new Set(state.clients.map((c) => c.personId));
  for (const approach of state.approaches) if (approach.status === "pending") taken.add(approach.personId);
  let pool = livingActors(catalog, state.date).filter((a) => !taken.has(a.id) && isEligible(a, state.era, state.date.year));
  const home = cityOf(state);
  if (home.hub !== "major") {
    const local = pool.filter((actor) => sameCountry(actor.nationality, home.country) || sameCountry(actor.placeOfBirth, home.country));
    if (local.length > 6) pool = [...local, ...pool.filter((actor) => !local.includes(actor))];
  }
  if (pool.length === 0) return;
  const person = pick(state.rng, pool.slice(0, 80).length ? pool.slice(0, Math.min(pool.length, 120)) : pool);
  pushApproach(state, catalog, person.id, { weeks: int(state.rng, 3, 6) });
}

function generateBrands(state: GameState): void {
  const candidates = state.clients.filter((c) => c.agency === "player" && c.contract && c.stats.marketability >= 60);
  if (candidates.length === 0 || !chance(state.rng, 0.12)) return;
  const client = pick(state.rng, candidates);
  if (state.brandDeals.some((d) => d.personId === client.personId && (d.status === "offered" || d.status === "active"))) return;
  const fee = Math.round((80_000 + client.stats.marketability * 8_000) / 1000) * 1000;
  state.brandDeals.unshift({
    id: nextId(state, "brand"),
    personId: client.personId,
    personName: client.name,
    brand: pick(state.rng, BRANDS),
    fee,
    start: { ...state.date },
    end: addWeeks(state.date, 12),
    status: "offered",
  });
  inbox(state, "money", `${client.name}: ${state.brandDeals[0]?.brand} wants a campaign`, `Fee $${fee.toLocaleString("en-US")}. Your cut is the commission. It does not block their schedule.`, `/agency#brand-${state.brandDeals[0]?.id}`, state.brandDeals[0]?.id);
}

function rivalAct(state: GameState, catalog: Catalog): void {
  if (state.date.week % 6 !== 0) return;
  const taken = new Set(state.clients.map((c) => c.personId));
  const pool = livingActors(catalog, state.date).filter((a) => !taken.has(a.id) && a.popularity > 20);
  if (pool.length) {
    const person = pick(state.rng, pool.slice(0, 40));
    const legacy = state.rivals.filter((row) => row.id === "meridian" || row.id === "northvale" || row.id === "atlas");
    const rival = pick(state.rng, legacy.length ? legacy : state.rivals);
    const client = clientFromCatalog(person, "rival", state.date, rival.id);
    client.contract = { commission: 10, start: { ...state.date }, termYears: 2, exclusive: true, exitClause: false };
    state.clients.push(client);
  }
  for (const rival of state.rivals) {
    const roster = state.clients.filter((c) => c.agency === "rival" && c.rivalId === rival.id);
    if (roster.length > 16) {
      const drop = roster[roster.length - 1];
      if (drop) state.clients = state.clients.filter((c) => c.personId !== drop.personId || c.agency === "player");
    }
  }
  const vulnerable = state.clients.find((c) => c.agency === "player" && c.loyalty < 40 && (c.mood === "Unhappy" || c.mood === "Furious" || c.unhappyStreak >= 2));
  if (vulnerable && !state.events.some((e) => !e.resolved && e.type === "poach")) {
    const rival = pick(state.rng, state.rivals);
    state.events.unshift({
      id: nextId(state, "evt"),
      type: "poach",
      title: `${rival.name} is circling ${vulnerable.name}`,
      body: `${vulnerable.name} has been unhappy, and ${rival.name} offered a quieter commission. Loyalty is ${vulnerable.loyalty}.`,
      personId: vulnerable.personId,
      date: { ...state.date },
      expires: addWeeks(state.date, 3),
      choices: [
        { id: "match_poach", label: "Match them and cut your commission", hint: "Drops your cut by 2 points. Loyalty recovers." },
        { id: "persuade", label: "Make the case", hint: "Works if loyalty, reputation, or your lawyer is strong." },
        { id: "let_go", label: "Let them walk", hint: "They leave. Reputation dips." },
      ],
    });
    inbox(state, "event", state.events[0]!.title, state.events[0]!.body, `/dashboard#event-${state.events[0]!.id}`, state.events[0]!.id);
  }
}

function maybeEvent(state: GameState, options: AdvanceOptions): boolean {
  const open = state.events.find((e) => !e.resolved);
  if (open) {
    if (cmpDate(open.expires, state.date) < 0) {
      const fallback = open.choices[0];
      if (fallback) {
        applyEventChoice(state, open.id, fallback.id);
        inbox(state, "event", `${open.title} settled itself`, `You waited it out. Default: ${fallback.label}.`);
      }
    } else if (!options.autoResolveEvents) return true;
  }
  const players = state.clients.filter((c) => c.agency === "player");
  if (players.length === 0) return false;
  const publicist = state.agency.staff.find((s) => s.role === "publicist")?.level ?? 0;
  if (!chance(state.rng, Math.max(0.05, 0.16 - publicist * 0.03))) return false;
  const event = buildEvent(state, pick(state.rng, players));
  if (!event) return false;
  state.events.unshift(event);
  inbox(state, "event", event.title, event.body, `/dashboard#event-${event.id}`, event.id);
  state.lastTurn.push(event.title);
  if (options.autoResolveEvents) {
    applyEventChoice(state, event.id, event.choices[0]!.id);
    return false;
  }
  return true;
}

function buildEvent(state: GameState, client: Client): GameState["events"][number] | null {
  const rng = state.rng;
  const project = state.projects.find((p) => p.playerInvolved && p.cast.some((c) => c.personId === client.personId && c.active) && !p.ended && !p.cancelled);
  const types = ["scandal", "injury", "feud", "strike", "leave", "indie", "franchise", "viral", "director", "delay"];
  const type = pick(rng, types);
  const expires = addWeeks(state.date, 3);
  const base = { id: nextId(state, "evt"), personId: client.personId, projectId: project?.id, date: { ...state.date }, expires, resolved: undefined };
  if (type === "scandal") {
    return { ...base, type, title: `A messy story about ${client.name}`, body: "A fictional tabloid has a vague, unflattering story. Nothing criminal. Everyone is already texting.", choices: [
      { id: "apologize", label: "Put out a plain apology", hint: "Buzz drops, reputation steadies." },
      { id: "ignore", label: "Say nothing", hint: "It lingers, and reputation suffers." },
      { id: "spin", label: "Let the publicist reframe it", hint: "Softer hit. Works best if you employ one." },
    ] };
  }
  if (type === "injury" && project && cmpDate(project.prepStart, state.date) <= 0 && cmpDate(state.date, shootEnd(project)) <= 0) {
    return { ...base, type, title: `${client.name} got hurt on ${project.title}`, body: "A stunt rehearsal went wrong. Nothing career-ending, but the week is gone.", choices: [
      { id: "delay", label: "Push the shoot two weeks", hint: "Dates move. The insurer is happier than the studio." },
      { id: "push", label: "Ask them to work through it", hint: "Keeps the date. Mood and reputation drop." },
    ] };
  }
  if (type === "feud") {
    return { ...base, type, title: `${client.name} is in a public feud`, body: "A co-star said something dismissive in a junket. It is now a personality.", choices: [
      { id: "mediate", label: "Shut it down privately", hint: "Quiet, small loyalty gain." },
      { id: "side_client", label: "Back your client in public", hint: "They love it. The town likes it less." },
      { id: "side_other", label: "Tell your client to let it go, loudly", hint: "They will not thank you." },
    ] };
  }
  if (type === "strike") {
    return { ...base, type, title: "A union action pauses sets across town", body: "Fictional, industry-wide, and awkward for anyone mid-shoot. Your clients are asking where you stand.", projectId: project?.id, choices: [
      { id: "support_strike", label: "Support the stoppage", hint: "Reputation up. A shoot may slip two weeks." },
      { id: "cross_line", label: "Tell them to keep working", hint: "You look cheap. Reputation takes a real hit." },
    ] };
  }
  if (type === "leave") {
    return { ...base, type, title: `${client.name} needs personal leave`, body: "They are asking for six weeks away from the calendar. They will not explain it in an email.", choices: [
      { id: "grant_leave", label: "Clear the six weeks", hint: "A hold blocks new work. Loyalty rises." },
      { id: "insist", label: "Tell them the timing is impossible", hint: "You keep the dates and lose the relationship." },
    ] };
  }
  if (type === "indie") {
    return { ...base, type, title: `${client.name} wants to make a tiny movie`, body: "A friend has a script and no money. Fifty thousand from the agency would get it shot.", choices: [
      { id: "back_indie", label: "Put up $50,000", hint: "Buzz and a little talent. Loyalty too." },
      { id: "pass_indie", label: "Wish them luck", hint: "No spend. They notice." },
    ] };
  }
  if (type === "franchise") {
    return { ...base, type, title: `A franchise is sniffing around ${client.name}`, body: "It would lock a character for years and pay like it. It would also define them.", choices: [
      { id: "encourage_franchise", label: "Tell them to take the meeting", hint: "They'll chase commercial offers next." },
      { id: "caution_franchise", label: "Walk them through the trap", hint: "Loyalty up if they trust your taste." },
    ] };
  }
  if (type === "viral") {
    return { ...base, type, title: `${client.name} is suddenly everywhere`, body: "A clip escaped. It is flattering, mostly, and very loud.", choices: [
      { id: "lean_in", label: "Feed it", hint: "Big buzz, a nick to reputation." },
      { id: "stay_quiet", label: "Let it pass", hint: "A smaller, cleaner bump." },
    ] };
  }
  if (type === "director" && project) {
    return { ...base, type, title: `${client.name} and the director of ${project.title} are not speaking`, body: "Notes have turned into a standoff. Someone has to blink.", choices: [
      { id: "back_actor", label: "Back your client", hint: "Loyalty up. The set stays tense." },
      { id: "back_director", label: "Ask your client to take the note", hint: "The movie may be better. They may not forgive you." },
    ] };
  }
  if (type === "delay" && project && cmpDate(project.prepStart, state.date) <= 0 && cmpDate(state.date, shootEnd(project)) <= 0) {
    return { ...base, type, title: `${project.title} is running over`, body: "Weather, or a rewrite, or both. The studio wants the cast to absorb it.", choices: [
      { id: "accept_delay", label: "Accept a two-week slip", hint: "Dates move. Nobody is the villain." },
      { id: "pay_overtime", label: "Cover $20,000 so the date holds", hint: "Cash out. Mood holds." },
    ] };
  }
  return { ...base, type: "viral", title: `${client.name} had a strange week`, body: "Nothing fatal. They want to know you noticed.", choices: [
    { id: "stay_quiet", label: "Check in and leave it", hint: "A small buzz bump." },
    { id: "lean_in", label: "Make a thing of it", hint: "Louder." },
  ] };
}

function writeNews(state: GameState): void {
  if (state.lastTurn.length === 0 && chance(state.rng, 0.4)) {
    const genre = pick(state.rng, GENRES);
    const trend = state.genreTrends[genre] ?? 1;
    state.news.unshift({
      id: `news_${++state.seq}`,
      date: { ...state.date },
      headline: trend >= 1.05 ? `${genre} is the easy yes this year` : trend <= 0.9 ? `Buyers are cooling on ${genre.toLowerCase()}` : `A quiet week on the ${genre.toLowerCase()} desks`,
      body: `The ${genre.toLowerCase()} trend is ${trend.toFixed(2)}. Studios are pricing offers accordingly.`,
    });
  }
  if (state.news.length > 80) state.news.length = 80;
}

function trim(state: GameState): void {
  if (state.inbox.length > 100) state.inbox.length = 100;
  if (state.events.length > 40) state.events.length = 40;
  if (state.ceremoniesRun.length > 80) state.ceremoniesRun.splice(0, state.ceremoniesRun.length - 60);
}

function inbox(state: GameState, kind: GameState["inbox"][number]["kind"], title: string, body: string, href?: string, refId?: string): void {
  state.inbox.unshift({ id: `in_${++state.seq}`, date: { ...state.date }, kind, title, body, href, read: false, resolved: false, refId });
}

function playerIds(state: GameState): number[] {
  return state.clients.filter((c) => c.agency === "player").map((c) => c.personId);
}

function dropProject(state: GameState, project: Project): void {
  state.projects = state.projects.filter((p) => p.id !== project.id);
  const genre = project.genres[0];
  if (genre && state.genreTallies[genre]) state.genreTallies[genre] -= 1;
  state.usedTitles = state.usedTitles.filter((t) => t !== project.title.toLowerCase());
}
