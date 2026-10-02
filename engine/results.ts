import { OUTLETS, STREAMERS } from "./constants";
import { releaseVerdictCopy, reviewLine, starsLabel, verdictCopy } from "./copy";
import { careerStageFor, clamp, dominantTrait, driftMood, fameFromStar, fameScore, genreFit, moodFromStars, roleWeight } from "./people";
import { chance, float, int, pick, type RngState } from "./rng";
import { absWeek, addWeeks } from "./schedule";
import type {
  CastMember,
  Client,
  GameState,
  ProfitLabel,
  Project,
  RenewalOutcome,
  Review,
  Season,
  SeriesFormat,
} from "./types";

export function profitLabelFor(gross: number, budget: number, marketing: number): ProfitLabel {
  const ratio = gross / Math.max(1, budget + marketing);
  if (ratio >= 3) return "blockbuster";
  if (ratio >= 1.8) return "hit";
  if (ratio >= 1.05) return "modest";
  if (ratio >= 0.7) return "disappointment";
  if (ratio >= 0.4) return "flop";
  return "bomb";
}

export function competingFilms(state: GameState, project: Project): Project[] {
  return state.projects.filter(
    (other) =>
      other.id !== project.id &&
      other.kind === "film" &&
      !other.cancelled &&
      other.release.year === project.release.year &&
      other.release.week === project.release.week &&
      other.budget >= 20_000_000,
  );
}

export function scoreFilm(state: GameState, project: Project): void {
  const rng = state.rng;
  const lead = project.cast.filter((c) => c.active && !c.writtenOut).sort((a, b) => a.billing - b.billing).slice(0, 2);
  const star = lead.length ? lead.reduce((sum, c) => sum + c.starPower, 0) / lead.length : 35;
  const buzz = lead.length ? lead.reduce((sum, c) => sum + c.buzz, 0) / lead.length : 30;
  const talent = lead.length ? lead.reduce((sum, c) => sum + c.talent, 0) / lead.length : 45;
  const market = lead.length ? lead.reduce((sum, c) => sum + c.marketability, 0) / lead.length : 40;
  const genre = project.genres[0] ?? "Drama";
  const trend = state.genreTrends[genre] ?? 1;
  const rivals = competingFilms(state, project);
  const competition = 1 / (1 + 0.16 * rivals.length);
  const variance = float(rng, 0.82, 1.2);
  const starFactor = 0.5 + star / 90;
  const buzzFactor = 0.72 + buzz / 160;
  const directorFactor = 0.78 + project.directorPull / 180;
  const base = project.budget * 0.2 + project.marketing * 0.38;
  const opening = Math.max(50_000, base * starFactor * buzzFactor * trend * directorFactor * competition * variance);
  const critic = clamp(
    project.scriptQuality * 0.46 + project.directorAcclaim * 0.3 + talent * 0.22 + genreFit(lead[0]?.genres ?? [], project.genres, 50) * 0.08 + float(rng, -7, 7),
    8,
    98,
  );
  const audience = clamp(critic * 0.55 + star * 0.18 + (PRESTIGE_FUN(genre) ) + float(rng, -8, 8), 8, 98);
  const legs = clampFloat(0.4 + critic / 280 + (audience - 50) / 220, 0.32, 0.72);
  const weekly: number[] = [];
  let weekGross = opening;
  for (let i = 0; i < 8; i++) {
    weekly.push(Math.round(weekGross));
    weekGross *= legs;
  }
  const domestic = weekly.reduce((sum, n) => sum + n, 0);
  const intlFactor = (genre === "Action" || genre === "Superhero" || genre === "Animation" || genre === "Fantasy" ? 1.15 : 0.72) + market / 140;
  const international = domestic * intlFactor * float(rng, 0.85, 1.15);
  const total = domestic + international;
  const profit = profitLabelFor(total, project.budget, project.marketing);
  project.openingWeekend = Math.round(opening);
  project.weeklyGross = weekly;
  project.domesticTotal = Math.round(domestic);
  project.internationalTotal = Math.round(international);
  project.totalGross = Math.round(total);
  project.criticScore = critic;
  project.audienceScore = audience;
  project.profitLabel = profit;
  project.ended = true;
  project.phase = "released";
  project.competitionNote = rivals.length ? `Shared the weekend with ${rivals.map((r) => r.title).slice(0, 2).join(" and ")}.` : "A relatively clear weekend.";
  project.resultWhy = {
    opening: `Opening uses budget and marketing as the floor, then star power ${Math.round(star)}, buzz ${Math.round(buzz)}, ${genre} trend ${trend.toFixed(2)}, ${project.directorName}'s commercial pull ${project.directorPull}, and ${rivals.length} competing wide release${rivals.length === 1 ? "" : "s"}.`,
    critic: `Critics blend script quality ${project.scriptQuality}, ${project.directorName}'s acclaim ${project.directorAcclaim}, and the leads' talent ${Math.round(talent)}.`,
    audience: `Audiences sit near the critic score, pulled by star power and how playful the genre usually is.`,
    profit: `${labelMoney(total)} worldwide against ${labelMoney(project.budget + project.marketing)} in budget plus marketing. That's a ${profit}.`,
  };
  project.reviews = makeReviews(rng, project, critic);
}

function PRESTIGE_FUN(genre: string): number {
  if (["Comedy", "Animation", "Family", "Horror", "Romantic Comedy"].includes(genre)) return 18;
  if (["Action", "Superhero", "Sports"].includes(genre)) return 12;
  return 6;
}

function clampFloat(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function labelMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

function makeReviews(rng: RngState, project: Project, critic: number): Review[] {
  const count = int(rng, 2, 4);
  const reviews: Review[] = [];
  const leads = project.cast.filter((c) => c.active).slice(0, 3);
  for (let i = 0; i < count; i++) {
    const actor = leads[i % Math.max(1, leads.length)];
    const standout = actor ? (actor.talent >= 75 && critic >= 60 ? "praise" : actor.talent < 40 || critic < 40 ? "pan" : "none") : "none";
    const line = reviewLine(rng, project.title, project.genres[0] ?? "Drama", clamp(critic + int(rng, -6, 6), 5, 99), actor ? { id: actor.personId, name: actor.name, standout } : undefined);
    reviews.push(line);
  }
  if (reviews.length === 0) {
    reviews.push({ outlet: pick(rng, OUTLETS), score: critic, text: `${project.title} is in theaters.` });
  }
  return reviews;
}

export function updatePeopleForRelease(state: GameState, project: Project): void {
  const expected = (project.budget + project.marketing) * 1.4;
  const gross = project.totalGross ?? 0;
  const ratio = gross / Math.max(1, expected);
  const critic = project.criticScore ?? 50;
  for (const member of project.cast) {
    if (!member.active || member.writtenOut) continue;
    const weight = roleWeight(member.role);
    const client = state.clients.find((c) => c.personId === member.personId);
    if (!client) continue;
    const starDelta = clampDelta((ratio - 1) * 8 * weight);
    const talentDelta = clampDelta((critic - 62) * 0.08 * weight);
    const buzzDelta = clampDelta((critic - 50) * 0.15 * weight + (ratio > 1 ? 8 : -4) * weight);
    const repDelta = clampDelta((member.satisfaction ?? 3) >= 3 ? 1 * weight : -2 * weight);
    client.stats.starPower = clamp(client.stats.starPower + starDelta, 1, 99);
    client.stats.talent = clamp(client.stats.talent + talentDelta, 1, 99);
    client.stats.buzz = clamp(client.stats.buzz + buzzDelta, 1, 99);
    client.stats.reputation = clamp(client.stats.reputation + repDelta, 1, 99);
    client.statWhy.starPower = `${project.title} ${project.profitLabel ?? "opened"} at ${labelMoney(gross)}. Role weight ${Math.round(weight * 100)}% moved star power by ${starDelta >= 0 ? "+" : ""}${starDelta}.`;
    client.statWhy.talent = `Critic score ${critic} on ${project.title} moved perceived talent by ${talentDelta >= 0 ? "+" : ""}${talentDelta}.`;
    client.statWhy.buzz = `Release attention on ${project.title} reset buzz.`;
    const wins = client.awards.filter((a) => a.result === "won").length;
    client.fame = fameFromStar(client.stats.starPower, wins);
    const age = client.birthday ? state.date.year - Number(client.birthday.slice(0, 4)) : null;
    client.careerStage = careerStageFor(age, client.stats.starPower, starDelta);
    member.starPower = client.stats.starPower;
    member.talent = client.stats.talent;
    member.buzz = client.stats.buzz;
  }
}

function clampDelta(n: number): number {
  return Math.max(-8, Math.min(8, Math.round(n)));
}

export function satisfactionForWrap(rng: RngState, client: Client, project: Project, member: CastMember): number {
  const fit = genreFit(client.preferredGenres, project.genres, client.stats.range);
  let score = 3;
  if (fit >= 70) score += 1;
  if (fit < 40) score -= 1;
  if (client.traits.prestigeVsMoney >= 68 && project.prestige < 48) score -= 1;
  if (client.traits.prestigeVsMoney <= 30 && (project.budgetTier === "tentpole" || project.budgetTier === "studio") && member.fee >= expectedRough(client)) score += 1;
  if (client.traits.greed >= 72 && member.fee < expectedRough(client) * 0.85) score -= 1;
  if (client.traits.ambition >= 75 && (member.role === "Cameo" || member.role === "Guest Star" || member.billing > 3)) score -= 1;
  if (project.directorAcclaim >= 75) score += 1;
  if (project.scriptQuality >= 78) score += 1;
  if (project.scriptQuality < 45) score -= 1;
  if (client.nextPreference === "prestige" && project.prestige < 55) score -= 1;
  if (client.nextPreference === "commercial" && project.budgetTier === "micro-indie") score -= 1;
  if (chance(rng, 0.2)) score += chance(rng, 0.5) ? 1 : -1;
  return Math.max(1, Math.min(5, score));
}

function expectedRough(client: Client): number {
  const table = { Unknown: 20_000, Working: 80_000, Known: 400_000, "A-list": 2_000_000, Icon: 8_000_000 };
  return table[client.fame];
}

export function applyWrapVerdict(state: GameState, project: Project, phase: "wrap" | "season"): void {
  const rng = state.rng;
  for (const member of project.cast) {
    if (!member.active || member.writtenOut || !member.isPlayerClient) continue;
    const client = state.clients.find((c) => c.personId === member.personId && c.agency === "player");
    if (!client) continue;
    const already = client.verdicts.some((v) => v.projectId === project.id && v.phase === phase && v.when.year === state.date.year && v.when.week === state.date.week);
    if (already) continue;
    const stars = satisfactionForWrap(rng, client, project, member);
    member.satisfaction = stars;
    const notes: string[] = [];
    if (project.shootWeeks >= 14) notes.push("Wish the shoot hadn't run long.");
    if (project.directorAcclaim < 42) notes.push("The director and I did not see the same movie.");
    if (project.scriptQuality >= 80) notes.push("The script was the best company on set.");
    if (member.billing > 2 && client.traits.ambition > 70) notes.push("I wanted a better spot on the poster.");
    const text = verdictCopy(rng, dominantTrait(client.traits), stars, notes);
    client.verdicts.unshift({
      id: `ver_${state.seq++}`,
      projectId: project.id,
      projectTitle: project.title,
      when: { ...state.date },
      phase,
      stars,
      label: starsLabel(stars),
      text,
    });
    client.mood = moodFromStars(stars);
    client.loyalty = clamp(client.loyalty + (stars - 3) * 6, 1, 99);
    if (stars <= 2) client.unhappyStreak += 1;
    else client.unhappyStreak = 0;
    if (stars <= 2 && project.budgetTier === "tentpole" && client.traits.prestigeVsMoney >= 55) client.nextPreference = "prestige";
    if (stars <= 2 && (project.budgetTier === "micro-indie" || project.budgetTier === "indie") && client.traits.greed >= 60) client.nextPreference = "commercial";
    if (stars >= 4) client.nextPreference = "none";
    if (client.revealedHints.length < 3 && chance(rng, 0.8)) {
      const hint = client.traits.prestigeVsMoney > 65 ? "After this one, they keep talking about the work, not the quote." : client.traits.greed > 65 ? "They brought up the fee before they brought up the director." : "They care who else is in the room.";
      if (!client.revealedHints.includes(hint)) client.revealedHints.push(hint);
    }
    state.inbox.unshift({
      id: `in_${state.seq++}`,
      date: { ...state.date },
      kind: "verdict",
      title: `${client.name} on ${project.title}`,
      body: `${starsLabel(stars)} · ${text}`,
      href: `/actors/${client.personId}?tab=verdicts`,
      read: false,
      resolved: false,
      refId: project.id,
    });
    state.lastTurn.push(`${client.name} wrapped ${project.title}: ${starsLabel(stars)}.`);
  }
}

export function applyReleaseVerdict(state: GameState, project: Project): void {
  const rng = state.rng;
  for (const member of project.cast) {
    if (!member.isPlayerClient || member.writtenOut) continue;
    const client = state.clients.find((c) => c.personId === member.personId && c.agency === "player");
    if (!client) continue;
    const prior = client.verdicts.find((v) => v.projectId === project.id);
    let stars = prior?.stars ?? member.satisfaction ?? 3;
    if ((project.criticScore ?? 0) >= 80) stars = Math.min(5, stars + 1);
    if (project.profitLabel === "bomb" || project.profitLabel === "flop") stars = Math.max(1, stars - 1);
    if (project.profitLabel === "blockbuster" && stars < 4 && client.traits.prestigeVsMoney < 40) stars = Math.min(5, stars + 1);
    const text = releaseVerdictCopy(rng, stars, project.profitLabel, project.criticScore);
    client.verdicts.unshift({
      id: `ver_${state.seq++}`,
      projectId: project.id,
      projectTitle: project.title,
      when: { ...state.date },
      phase: "release",
      stars,
      label: starsLabel(stars),
      text,
    });
    client.mood = moodFromStars(stars);
    client.loyalty = clamp(client.loyalty + (stars - 3) * 3, 1, 99);
    state.inbox.unshift({
      id: `in_${state.seq++}`,
      date: { ...state.date },
      kind: "verdict",
      title: `${client.name} after ${project.title} opened`,
      body: text,
      href: `/actors/${client.personId}?tab=verdicts`,
      read: false,
      resolved: false,
      refId: project.id,
    });
  }
}

export function openingViews(project: Project, season: Season): number {
  const lead = project.cast.find((c) => c.active && !c.writtenOut);
  const star = lead?.starPower ?? 40;
  const reach = STREAMERS.find((s) => s.name === project.network)?.reach ?? 1;
  const trend = 1;
  const base = (formatReach(project.format) * 1_000_000 + star * 40_000) * reach * (0.8 + (project.criticScore ?? season.criticScore ?? 60) / 200);
  return Math.max(200_000, base * trend);
}

function formatReach(format: SeriesFormat | null): number {
  if (format === "sitcom") return 4.5;
  if (format === "ongoing_drama") return 3.4;
  if (format === "streaming") return 2.8;
  if (format === "limited") return 2.2;
  if (format === "miniseries") return 1.6;
  if (format === "anthology") return 1.8;
  return 2;
}

export function pushEpisode(state: GameState, project: Project, season: Season): void {
  const rng = state.rng;
  if (!season.criticScore) {
    const leadTalent = project.cast.filter((c) => c.active).reduce((sum, c, _, arr) => sum + c.talent / Math.max(1, arr.length), 0);
    season.criticScore = clamp(project.scriptQuality * 0.5 + project.directorAcclaim * 0.25 + leadTalent * 0.25 + float(rng, -6, 6), 10, 98);
    season.audienceScore = clamp(season.criticScore * 0.6 + float(rng, 10, 30), 10, 98);
    project.criticScore = season.criticScore;
    project.audienceScore = season.audienceScore;
    season.reviews = makeReviews(rng, project, season.criticScore);
    project.reviews = season.reviews;
  }
  const first = season.viewership[0] ?? openingViews(project, season);
  const prev = season.viewership[season.viewership.length - 1] ?? first;
  const drift = float(rng, 0.86, 1.06) * (season.criticScore >= 70 ? 1.03 : 0.98);
  const next = season.viewership.length === 0 ? first : prev * drift;
  season.viewership.push(Math.round(next));
  season.episodesAired = season.viewership.length;
  project.weeklyGross = season.viewership;
}

export function decideRenewal(input: {
  format: SeriesFormat | null;
  viewership: number[];
  critic: number;
  budget: number;
  strategy: number;
  rng: RngState;
}): RenewalOutcome {
  if (input.format === "limited" || input.format === "miniseries") return "finale";
  const first = input.viewership[0] ?? 1;
  const last = input.viewership[input.viewership.length - 1] ?? first;
  const avg = input.viewership.reduce((s, n) => s + n, 0) / Math.max(1, input.viewership.length);
  const retention = last / Math.max(1, first);
  const costPressure = input.budget > 50_000_000 ? 0.25 : input.budget > 25_000_000 ? 0.1 : 0;
  const score =
    retention * 40 +
    (input.critic / 100) * 30 +
    Math.min(1.2, avg / 4_000_000) * 20 -
    costPressure * 20 +
    input.strategy * 15 +
    float(input.rng, -4, 4);
  if (input.format === "anthology") {
    if (score < 48) return "cancelled";
    return chance(input.rng, 0.65) ? "renewed" : "finale";
  }
  if (score >= 70) return "renewed";
  if (score >= 52) return "renewed_short";
  if (score >= 40 && chance(input.rng, 0.5)) return "finale";
  return "cancelled";
}

export function shouldWriteOut(rng: RngState, member: CastMember, format: SeriesFormat | null, renewal: RenewalOutcome): boolean {
  if (renewal === "cancelled" || renewal === "finale") return false;
  if (member.role === "Guest Star") return true;
  if (format === "anthology") return chance(rng, 0.75);
  let risk = 0.08;
  if (member.role === "Recurring") risk += 0.25;
  if ((member.satisfaction ?? 3) <= 2) risk += 0.3;
  if (member.fee > 2_000_000) risk += 0.22;
  if (member.billing > 3) risk += 0.12;
  if ((member.satisfaction ?? 3) >= 4 && member.role === "Series Regular") risk -= 0.08;
  return chance(rng, Math.max(0.02, Math.min(0.85, risk)));
}

export function startNextSeason(state: GameState, project: Project, shorter: boolean): Season {
  const prev = project.seasons[project.seasons.length - 1]!;
  const episodes = shorter ? Math.max(4, prev.episodes - int(state.rng, 2, 4)) : prev.episodes;
  const shootWeeks = Math.max(4, Math.round(episodes * 0.65));
  const prepStart = addWeeks(state.date, int(state.rng, 6, 12));
  const shootStart = addWeeks(prepStart, int(state.rng, 3, 5));
  const premiere = addWeeks(shootStart, shootWeeks + int(state.rng, 4, 8));
  const season: Season = {
    number: prev.number + 1,
    episodes,
    episodeMinutes: prev.episodeMinutes,
    schedule: prev.schedule,
    prepStart,
    shootStart,
    shootWeeks,
    premiere,
    episodesAired: 0,
    viewership: [],
    renewal: "pending",
    reviews: [],
  };
  project.seasons.push(season);
  project.prepStart = prepStart;
  project.shootStart = shootStart;
  project.shootWeeks = shootWeeks;
  project.release = premiere;
  project.ended = false;
  project.commissionsPaid = [];
  project.budget = Math.round(project.budget * (episodes / Math.max(1, prev.episodes)) * float(state.rng, 0.95, 1.15));
  return season;
}

export function airingDone(season: Season, dateAbs: number): boolean {
  const premiere = absWeek(season.premiere);
  if (dateAbs < premiere) return false;
  if (season.schedule === "binge") return season.episodesAired >= season.episodes;
  return season.episodesAired >= season.episodes;
}

export function decayBuzz(state: GameState): void {
  const publicist = state.agency.staff.find((s) => s.role === "publicist")?.level ?? 0;
  const keep = publicist > 0 ? 0.94 : 0.9;
  for (const client of state.clients) {
    if (client.agency !== "player") continue;
    client.stats.buzz = clamp(client.stats.buzz * keep, 3, 99);
    if (state.date.week % 6 === 0) client.mood = driftMood(client.mood);
  }
}

export function snapshotHistory(state: GameState): void {
  if (state.date.week % 4 !== 0) return;
  for (const client of state.clients) {
    if (client.agency !== "player") continue;
    const wins = client.awards.filter((a) => a.result === "won").length;
    client.history.push({ year: state.date.year, week: state.date.week, score: fameScore(client.stats, wins) });
    if (client.history.length > 80) client.history.splice(0, client.history.length - 80);
  }
}

export function clientById(state: GameState, personId: number): Client | undefined {
  return state.clients.find((c) => c.personId === personId);
}
