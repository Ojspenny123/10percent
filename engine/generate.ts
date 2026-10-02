import {
  BUDGETS,
  GENRES,
  GENRE_BASE,
  PRESTIGE_GENRE,
  SERIES_EPISODES,
  STREAMERS,
  STUDIOS,
  TIER_WEIGHTS,
  TITLE_PARTS,
} from "./constants";
import { characterName, loglineFor, scriptNote } from "./copy";
import { awardTrack, clamp, expectedFee, genreFit, isEligible, preferredGenres, seedStats, traitsFor } from "./people";
import { chance, float, int, pick, weightedPick, type RngState } from "./rng";
import { addWeeks, scheduleConflict, shootEnd } from "./schedule";
import type {
  BudgetTier,
  CastMember,
  Catalog,
  CatalogPerson,
  Client,
  GameDate,
  GameState,
  Project,
  RoleType,
  Season,
  SeriesFormat,
} from "./types";

export function nextId(state: GameState, prefix: string): string {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

export function pickGenre(rng: RngState, tallies: Record<string, number>, total: number, forced?: string): string {
  if (forced && (GENRES as readonly string[]).includes(forced)) return forced;
  const missing = GENRES.filter((g) => !(tallies[g] ?? 0));
  if (total >= 18 && missing.length > 0 && total % 3 === 0) return missing[0]!;
  const weights = GENRES.map((genre) => {
    const count = tallies[genre] ?? 0;
    const share = total === 0 ? 0 : count / total;
    let penalty = 1 / (1 + count * 0.5);
    if (share > 0.1) penalty *= 0.22;
    if (share > 0.15) penalty *= 0.08;
    return (GENRE_BASE[genre] ?? 1) * penalty;
  });
  return weightedPick(rng, GENRES, weights);
}

export function makeTitle(rng: RngState, genre: string, used: Set<string>): string {
  const parts = TITLE_PARTS[genre] ?? TITLE_PARTS.Drama!;
  for (let i = 0; i < 16; i++) {
    const a = pick(rng, parts.a);
    const b = pick(rng, parts.b);
    const c = pick(rng, parts.c);
    const pattern = int(rng, 0, 4);
    const title =
      pattern === 0 ? `${a} ${b}` : pattern === 1 ? `${b} ${c}` : pattern === 2 ? `The ${b} of ${c}` : pattern === 3 ? `${a} ${c}` : `${b}`;
    const clean = title.replace(/\s+/g, " ").trim();
    if (!used.has(clean.toLowerCase())) {
      used.add(clean.toLowerCase());
      return clean;
    }
  }
  const fallback = `${pick(rng, parts.b)} ${int(rng, 2, 90)}`;
  used.add(fallback.toLowerCase());
  return fallback;
}

export function rememberTitle(state: GameState, title: string): void {
  state.usedTitles.push(title.toLowerCase());
  if (state.usedTitles.length > 2500) state.usedTitles.splice(0, state.usedTitles.length - 2000);
}

function usedSet(state: GameState): Set<string> {
  return new Set(state.usedTitles);
}

export function rollTier(rng: RngState, genre: string, bias?: BudgetTier): BudgetTier {
  if (bias) return bias;
  const table = TIER_WEIGHTS[genre] ?? (["indie", "mid", "mid", "studio", "micro-indie"] as BudgetTier[]);
  return pick(rng, table);
}

export function rollMoney(rng: RngState, tier: BudgetTier): { budget: number; marketing: number } {
  const spec = BUDGETS[tier];
  const budget = Math.round(float(rng, spec.min, spec.max) / 1000) * 1000;
  const marketing = Math.round(budget * spec.marketing * float(rng, 0.85, 1.15));
  return { budget, marketing };
}

function directorScores(person: CatalogPerson, genres: string[]): number {
  const mix = preferredGenres(person.genreMix);
  const fit = genres.some((g) => mix.includes(g)) ? 1.4 : 1;
  return Math.max(1, person.avgRating) * fit * (1 + person.popularity / 80);
}

export function pickDirector(rng: RngState, catalog: Catalog, genres: string[], date: GameDate): CatalogPerson | null {
  const pool = catalog.directors.filter((d) => isEligible(d, "today", date.year) || isEligible(d, "1990s", date.year) || ageOk(d, date));
  const usable = pool.length ? pool : catalog.directors;
  if (usable.length === 0) return null;
  const ranked = [...usable].sort((a, b) => directorScores(b, genres) - directorScores(a, genres)).slice(0, 12);
  const weights = ranked.map((d) => directorScores(d, genres));
  return weightedPick(rng, ranked, weights);
}

function ageOk(person: CatalogPerson, date: GameDate): boolean {
  if (person.deathday) {
    const year = Number(person.deathday.slice(0, 4));
    if (Number.isFinite(year) && year < date.year) return false;
  }
  return true;
}

export function livingActors(catalog: Catalog, date: GameDate): CatalogPerson[] {
  return catalog.actors.filter((actor) => ageOk(actor, date));
}

function planFilmWindow(rng: RngState, from: GameDate, tier: BudgetTier, historical: boolean): {
  prepStart: GameDate;
  shootStart: GameDate;
  shootWeeks: number;
  postWeeks: number;
  release: GameDate;
} {
  const shootWeeks =
    tier === "micro-indie" ? int(rng, 3, 5) : tier === "indie" ? int(rng, 5, 8) : tier === "mid" ? int(rng, 7, 11) : tier === "studio" ? int(rng, 9, 14) : int(rng, 12, 18);
  const prepWeeks = int(rng, 2, 5);
  const postWeeks = tier === "tentpole" || tier === "studio" ? int(rng, 16, 28) : int(rng, 8, 18);
  if (historical) {
    const release = { year: from.year - 1, week: int(rng, 6, 50) };
    const shootStart = addWeeks(release, -(postWeeks + shootWeeks));
    const prepStart = addWeeks(shootStart, -prepWeeks);
    return { prepStart, shootStart, shootWeeks, postWeeks, release };
  }
  const shootStart = addWeeks(from, int(rng, 8, 26));
  const prepStart = addWeeks(shootStart, -prepWeeks);
  const release = addWeeks(shootStart, shootWeeks + postWeeks);
  return { prepStart, shootStart, shootWeeks, postWeeks, release };
}

export function toCast(
  person: CatalogPerson,
  role: RoleType,
  billing: number,
  fee: number,
  backend: number,
  player: boolean,
): CastMember {
  const seeded = seedStats(person);
  return {
    personId: person.id,
    name: person.name,
    profilePath: person.profilePath,
    gender: person.gender,
    role,
    character: "",
    fee,
    billing,
    backend,
    starPower: seeded.stats.starPower,
    talent: seeded.stats.talent,
    buzz: seeded.stats.buzz,
    marketability: seeded.stats.marketability,
    genres: preferredGenres(person.genreMix),
    traits: traitsFor(person.id),
    isPlayerClient: player,
    writtenOut: false,
    active: true,
    awardTrack: awardTrack(person.gender),
  };
}

export function castFromClient(client: Client, role: RoleType, billing: number, fee: number, backend: number, character: string): CastMember {
  return {
    personId: client.personId,
    name: client.name,
    profilePath: client.profilePath,
    gender: client.gender,
    role,
    character,
    fee,
    billing,
    backend,
    starPower: client.stats.starPower,
    talent: client.stats.talent,
    buzz: client.stats.buzz,
    marketability: client.stats.marketability,
    genres: client.preferredGenres,
    traits: client.traits,
    isPlayerClient: client.agency === "player",
    writtenOut: false,
    active: true,
    awardTrack: awardTrack(client.gender),
  };
}

function freePeople(state: GameState, people: CatalogPerson[], prep: GameDate, finish: GameDate, exclude: Set<number>): CatalogPerson[] {
  return people.filter((person) => !exclude.has(person.id) && !scheduleConflict(state, person.id, prep, finish));
}

function pickCastPerson(
  rng: RngState,
  people: CatalogPerson[],
  genres: string[],
  wantStar: number,
): CatalogPerson | null {
  if (people.length === 0) return null;
  const scored = people.map((person) => {
    const stats = seedStats(person).stats;
    const fit = genreFit(preferredGenres(person.genreMix), genres, stats.range);
    const starGap = Math.abs(stats.starPower - wantStar);
    return { person, weight: Math.max(0.2, fit / 20) * Math.max(0.3, 1.4 - starGap / 80) };
  });
  scored.sort((a, b) => b.weight - a.weight);
  const top = scored.slice(0, 14);
  return weightedPick(
    rng,
    top.map((s) => s.person),
    top.map((s) => s.weight),
  );
}

const FILM_ROLES: { role: RoleType; billing: number; chance: number; star: number }[] = [
  { role: "Lead", billing: 1, chance: 1, star: 70 },
  { role: "Co-lead", billing: 2, chance: 0.55, star: 60 },
  { role: "Supporting", billing: 3, chance: 0.8, star: 42 },
  { role: "Cameo", billing: 5, chance: 0.25, star: 55 },
];

export function blankProject(state: GameState, partial: Partial<Project> & Pick<Project, "kind" | "title" | "genres">): Project {
  const today = state.date;
  return {
    id: partial.id ?? nextId(state, "prj"),
    kind: partial.kind,
    title: partial.title,
    logline: partial.logline ?? "",
    genres: partial.genres,
    budgetTier: partial.budgetTier ?? "mid",
    budget: partial.budget ?? 0,
    marketing: partial.marketing ?? 0,
    directorId: partial.directorId ?? null,
    directorName: partial.directorName ?? "TBD",
    directorPull: partial.directorPull ?? 40,
    directorAcclaim: partial.directorAcclaim ?? 50,
    studio: partial.studio ?? "Harborlight Pictures",
    prepStart: partial.prepStart ?? today,
    shootStart: partial.shootStart ?? today,
    shootWeeks: partial.shootWeeks ?? 8,
    postWeeks: partial.postWeeks ?? 12,
    release: partial.release ?? today,
    format: partial.format ?? null,
    network: partial.network ?? null,
    episodeMinutes: partial.episodeMinutes ?? null,
    seasons: partial.seasons ?? [],
    phase: partial.phase ?? "development",
    scriptQuality: partial.scriptQuality ?? 60,
    scriptNote: partial.scriptNote ?? "",
    prestige: partial.prestige ?? 50,
    risk: partial.risk ?? 40,
    cast: partial.cast ?? [],
    openRole: partial.openRole ?? null,
    reviews: partial.reviews ?? [],
    weeklyGross: partial.weeklyGross ?? [],
    sequelNumber: partial.sequelNumber ?? 1,
    historical: partial.historical ?? false,
    playerInvolved: partial.playerInvolved ?? false,
    fycSpend: partial.fycSpend ?? 0,
    festival: partial.festival ?? null,
    commissionsPaid: partial.commissionsPaid ?? [],
    ended: partial.ended ?? false,
    cancelled: partial.cancelled ?? false,
    criticScore: partial.criticScore,
    audienceScore: partial.audienceScore,
    openingWeekend: partial.openingWeekend,
    domesticTotal: partial.domesticTotal,
    internationalTotal: partial.internationalTotal,
    totalGross: partial.totalGross,
    profitLabel: partial.profitLabel,
    resultWhy: partial.resultWhy,
    franchiseId: partial.franchiseId,
    competitionNote: partial.competitionNote,
  };
}

function noteGenre(state: GameState, genre: string): void {
  state.genreTallies[genre] = (state.genreTallies[genre] ?? 0) + 1;
}

export function genreTotal(state: GameState): number {
  return Object.values(state.genreTallies).reduce((sum, n) => sum + n, 0);
}

function applyDirector(rng: RngState, catalog: Catalog, genres: string[], date: GameDate): Pick<Project, "directorId" | "directorName" | "directorPull" | "directorAcclaim"> {
  const director = pickDirector(rng, catalog, genres, date);
  if (!director) {
    return { directorId: null, directorName: "A first-time director", directorPull: 35, directorAcclaim: 48 };
  }
  const acclaim = clamp((director.avgRating - 4) * 20 + 10, 20, 96);
  const pull = clamp(Math.log10(director.popularity + 1) * 34, 15, 96);
  return { directorId: director.id, directorName: director.name, directorPull: pull, directorAcclaim: acclaim };
}

export function spawnFilm(
  state: GameState,
  catalog: Catalog,
  options: {
    historical?: boolean;
    genre?: string;
    excludePeople?: Set<number>;
    openFor?: { client: Client; role: RoleType; billing: number } | null;
    windowFrom?: GameDate;
    sequelTitle?: string;
    franchiseId?: string;
    sequelNumber?: number;
    forceTier?: BudgetTier;
  } = {},
): Project | null {
  const rng = state.rng;
  const total = genreTotal(state);
  const genre = options.genre ?? pickGenre(rng, state.genreTallies, total);
  const secondary = chance(rng, 0.28) ? pickGenre(rng, state.genreTallies, total + 1) : null;
  const genres = secondary && secondary !== genre ? [genre, secondary] : [genre];
  const tier = options.forceTier ?? rollTier(rng, genre);
  const money = rollMoney(rng, tier);
  let window = planFilmWindow(rng, options.windowFrom ?? state.date, tier, Boolean(options.historical));
  const director = applyDirector(rng, catalog, genres, window.shootStart);
  const scriptQuality = clamp(float(rng, 38, 92) * 0.7 + director.directorAcclaim * 0.3, 30, 96);
  const prestige = clamp(PRESTIGE_GENRE[genre]! * 0.62 + director.directorAcclaim * 0.28 + (tier === "micro-indie" || tier === "indie" ? 8 : 0) - (tier === "tentpole" ? 6 : 0));
  const trend = state.genreTrends[genre] ?? 1;
  const risk = clamp(68 - scriptQuality * 0.35 - director.directorAcclaim * 0.15 + (trend < 0.9 ? 10 : 0) + (tier === "tentpole" ? 6 : 0));
  const used = usedSet(state);
  const title = options.sequelTitle ?? makeTitle(rng, genre, used);
  rememberTitle(state, title);
  const exclude = new Set(options.excludePeople ?? []);
  if (options.openFor) exclude.add(options.openFor.client.personId);
  let cast: CastMember[] = [];
  for (let attempt = 0; attempt < (options.historical ? 1 : 4); attempt++) {
    if (attempt > 0) window = planFilmWindow(rng, options.windowFrom ?? state.date, tier, false);
    const pool = livingActors(catalog, window.shootStart).filter((actor) => !exclude.has(actor.id));
    const finish = shootEnd({ shootStart: window.shootStart, shootWeeks: window.shootWeeks });
    cast = [];
    let filledLead = Boolean(options.openFor && options.openFor.role === "Lead");
    for (const slot of FILM_ROLES) {
      if (options.openFor && slot.role === options.openFor.role) continue;
      if (!chance(rng, slot.chance) && slot.role !== "Lead") continue;
      if (options.openFor && slot.role === "Lead" && options.openFor.role === "Lead") continue;
      const want = tier === "tentpole" || tier === "studio" ? slot.star + 10 : tier === "micro-indie" ? slot.star - 20 : slot.star;
      const free = freePeople(state, pool, window.prepStart, finish, new Set([...exclude, ...cast.map((c) => c.personId)]));
      const person = pickCastPerson(rng, free, genres, want);
      if (!person) continue;
      const fameGuess = person.popularity > 80 ? "A-list" : person.popularity > 40 ? "Known" : person.popularity > 15 ? "Working" : "Unknown";
      const fee = expectedFee(fameGuess, slot.role, tier);
      const member = toCast(person, slot.role, slot.billing, fee, slot.role === "Lead" ? int(rng, 0, 4) : 0, false);
      member.character = characterName(rng);
      cast.push(member);
      if (slot.role === "Lead") filledLead = true;
    }
    if (filledLead || options.openFor) break;
  }

  if (!options.openFor && !cast.some((c) => c.role === "Lead")) return null;

  const project = blankProject(state, {
    kind: "film",
    title,
    genres,
    logline: loglineFor(rng, genre),
    budgetTier: tier,
    budget: money.budget,
    marketing: money.marketing,
    ...director,
    ...window,
    studio: pick(rng, STUDIOS),
    phase: options.historical ? "released" : "development",
    scriptQuality,
    scriptNote: scriptNote(scriptQuality),
    prestige,
    risk,
    cast,
    historical: Boolean(options.historical),
    playerInvolved: Boolean(options.openFor && options.openFor.client.agency === "player"),
    sequelNumber: options.sequelNumber ?? 1,
    franchiseId: options.franchiseId,
    openRole: options.openFor
      ? {
          role: options.openFor.role,
          character: characterName(rng),
          billing: options.openFor.billing,
          forPersonId: options.openFor.client.personId,
        }
      : null,
    ended: Boolean(options.historical),
  });
  noteGenre(state, genre);
  state.projects.push(project);
  return project;
}

const SERIES_FORMATS: SeriesFormat[] = ["limited", "ongoing_drama", "sitcom", "streaming", "miniseries", "anthology"];

export function spawnSeries(
  state: GameState,
  catalog: Catalog,
  options: {
    genre?: string;
    openFor?: { client: Client; role: RoleType; billing: number } | null;
    excludePeople?: Set<number>;
  } = {},
): Project | null {
  const rng = state.rng;
  const total = genreTotal(state);
  const genre = options.genre ?? pickGenre(rng, state.genreTrends ? state.genreTallies : {}, total);
  const format = pick(rng, SERIES_FORMATS);
  const spec = SERIES_EPISODES[format];
  const episodes = int(rng, spec.min, spec.max);
  const schedule = spec.schedule === "either" ? (chance(rng, 0.5) ? "weekly" : "binge") : spec.schedule;
  const episodeMinutes = format === "sitcom" ? 22 : format === "streaming" || format === "limited" ? int(rng, 42, 58) : int(rng, 42, 60);
  const shootWeeks = Math.max(5, Math.round(episodes * 0.7));
  const prepWeeks = int(rng, 3, 5);
  const offset = int(rng, 8, 22);
  const shootStart = addWeeks(state.date, offset);
  const prepStart = addWeeks(shootStart, -prepWeeks);
  const premiere = addWeeks(shootStart, shootWeeks + int(rng, 3, 8));
  const network = pick(rng, STREAMERS);
  const director = applyDirector(rng, catalog, [genre], shootStart);
  const scriptQuality = clamp(float(rng, 40, 90) * 0.65 + director.directorAcclaim * 0.35, 30, 96);
  const prestige = clamp((PRESTIGE_GENRE[genre] ?? 55) * 0.55 + (format === "limited" || format === "miniseries" ? 18 : 0) + director.directorAcclaim * 0.2);
  const tier: BudgetTier = format === "sitcom" ? "mid" : format === "streaming" || format === "limited" ? pick(rng, ["mid", "studio"] as BudgetTier[]) : "mid";
  const perEp = tier === "studio" ? int(rng, 4_000_000, 9_000_000) : int(rng, 1_500_000, 4_500_000);
  const budget = perEp * episodes;
  const used = usedSet(state);
  const title = makeTitle(rng, genre, used);
  rememberTitle(state, title);
  const season: Season = {
    number: 1,
    episodes,
    episodeMinutes,
    schedule,
    prepStart,
    shootStart,
    shootWeeks,
    premiere,
    episodesAired: 0,
    viewership: [],
    renewal: "pending",
    reviews: [],
  };
  const exclude = new Set(options.excludePeople ?? []);
  if (options.openFor) exclude.add(options.openFor.client.personId);
  const finish = shootEnd({ shootStart, shootWeeks });
  const pool = livingActors(catalog, shootStart);
  const regulars = format === "miniseries" ? 2 : format === "anthology" ? 1 : int(rng, 2, 4);
  const cast: CastMember[] = [];
  const slots: { role: RoleType; billing: number }[] = [];
  for (let i = 0; i < regulars; i++) slots.push({ role: "Series Regular", billing: i + 1 });
  if (chance(rng, 0.7)) slots.push({ role: "Recurring", billing: regulars + 1 });
  if (chance(rng, 0.4)) slots.push({ role: "Guest Star", billing: regulars + 2 });
  for (const slot of slots) {
    if (options.openFor && slot.role === options.openFor.role && slot.billing === options.openFor.billing) continue;
    const free = freePeople(state, pool, prepStart, finish, new Set([...exclude, ...cast.map((c) => c.personId)]));
    const person = pickCastPerson(rng, free, [genre], slot.role === "Series Regular" ? 58 : 40);
    if (!person) continue;
    const fameGuess = person.popularity > 60 ? "Known" : "Working";
    const member = toCast(person, slot.role, slot.billing, expectedFee(fameGuess, slot.role, tier), 0, false);
    member.character = characterName(rng);
    cast.push(member);
  }
  if (!options.openFor && cast.length === 0) return null;
  const project = blankProject(state, {
    kind: "series",
    title,
    genres: [genre],
    logline: loglineFor(rng, genre),
    budgetTier: tier,
    budget,
    marketing: Math.round(budget * 0.18),
    ...director,
    prepStart,
    shootStart,
    shootWeeks,
    postWeeks: 4,
    release: premiere,
    format,
    network: network.name,
    episodeMinutes,
    seasons: [season],
    studio: network.name,
    phase: "development",
    scriptQuality,
    scriptNote: scriptNote(scriptQuality),
    prestige,
    risk: clamp(55 - scriptQuality * 0.2 + (network.strategy < 0 ? 8 : 0)),
    cast,
    playerInvolved: Boolean(options.openFor && options.openFor.client.agency === "player"),
    openRole: options.openFor
      ? {
          role: options.openFor.role,
          character: characterName(rng),
          billing: options.openFor.billing,
          forPersonId: options.openFor.client.personId,
        }
      : null,
  });
  noteGenre(state, genre);
  state.projects.push(project);
  return project;
}

export function roleForClient(rng: RngState, client: Client, kind: "film" | "series"): { role: RoleType; billing: number } {
  if (kind === "series") {
    if (client.fame === "Icon" || client.fame === "A-list" || client.fame === "Known") return { role: "Series Regular", billing: 1 };
    if (chance(rng, 0.4)) return { role: "Recurring", billing: 3 };
    return { role: "Series Regular", billing: client.fame === "Unknown" ? 4 : 2 };
  }
  if (client.fame === "Icon" || client.fame === "A-list") return { role: chance(rng, 0.25) ? "Co-lead" : "Lead", billing: 1 };
  if (client.fame === "Known") return chance(rng, 0.55) ? { role: "Lead", billing: 1 } : { role: "Co-lead", billing: 2 };
  if (client.fame === "Working") return chance(rng, 0.35) ? { role: "Lead", billing: 1 } : { role: "Supporting", billing: 3 };
  return chance(rng, 0.2) ? { role: "Supporting", billing: 4 } : { role: "Cameo", billing: 6 };
}

export function tierForClient(client: Client, genre: string): BudgetTier | undefined {
  if (client.fame === "Icon" || client.fame === "A-list") {
    if (genre === "Horror" || genre === "Documentary") return undefined;
    return client.fame === "Icon" ? "tentpole" : pickSafe();
  }
  if (client.fame === "Unknown") return "micro-indie";
  return undefined;
  function pickSafe(): BudgetTier {
    return genre === "Superhero" || genre === "Action" ? "tentpole" : "studio";
  }
}

export function syncCastFromClients(state: GameState): void {
  const byId = new Map(state.clients.map((c) => [c.personId, c]));
  for (const project of state.projects) {
    for (const member of project.cast) {
      const client = byId.get(member.personId);
      if (!client) continue;
      member.starPower = client.stats.starPower;
      member.talent = client.stats.talent;
      member.buzz = client.stats.buzz;
      member.marketability = client.stats.marketability;
      member.isPlayerClient = client.agency === "player";
      member.traits = client.traits;
    }
  }
}
