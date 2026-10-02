import type {
  BoxBonus,
  BudgetTier,
  CatalogPerson,
  Client,
  CreditSide,
  FameTier,
  GameDate,
  GameState,
  Medium,
  Project,
  RealCredit,
  RoleType,
  Season,
  SeriesDeal,
  SeriesDealStyle,
  SeriesFormat,
  WorkBlock,
} from "./types";
import { addWeeks, absWeek } from "./schedule";
import { makeRng, next, int, chance } from "./rng";
import type { RngState } from "./rng";

function clamp(n: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export const PILOT_WEEKS = { start: 8, end: 20 };

const EPISODE_BASE: Record<FameTier, number> = {
  Unknown: 8_000,
  Working: 25_000,
  Known: 85_000,
  "A-list": 275_000,
  Icon: 650_000,
};

const ROLE_EPISODE: Record<RoleType, number> = {
  Lead: 1.35,
  "Co-lead": 1.05,
  Supporting: 0.4,
  Cameo: 0.12,
  "Series Regular": 1,
  Recurring: 0.42,
  "Guest Star": 0.22,
};

export function sideRng(state: Pick<GameState, "seed" | "date">, salt: number): RngState {
  const mixed = (Math.imul(state.seed || 1, 997) + absWeek(state.date) * 13 + salt * 17) >>> 0;
  return makeRng(mixed || 1);
}

export function inPilotSeason(date: GameDate): boolean {
  return date.week >= PILOT_WEEKS.start && date.week <= PILOT_WEEKS.end;
}

export function profileFromCredits(
  credits: RealCredit[],
  popularity: number,
  personId: number,
  year: number,
  sides?: { movie?: CreditSide; tv?: CreditSide },
): { medium: Medium; filmStar: number; tvStar: number; filmPrestige: number; tvPrestige: number } {
  const movie = sides?.movie ?? sideFromList(credits.filter((credit) => credit.mediaType !== "tv"), year);
  const tv = sides?.tv ?? sideFromList(credits.filter((credit) => credit.mediaType === "tv"), year);
  if (movie.count + tv.count === 0) return hashedProfile(personId, popularity);
  const filmScore = creditMass(movie);
  const tvScore = creditMass(tv);
  const pop = Math.log10(popularity + 1) * 14;
  const medium = chooseMedium(filmScore, tvScore);
  const tint = (personId % 9) - 4;
  const filmStar = clamp(16 + filmScore + (medium === "TV" ? pop * 0.4 : pop) + tint, 1, 99);
  const tvStar = clamp(16 + tvScore + (medium === "Film" ? pop * 0.4 : pop) - tint, 1, 99);
  return {
    medium,
    filmStar,
    tvStar,
    filmPrestige: clamp(movie.avgRating ? movie.avgRating * 10 : 40 + (personId % 17), 1, 99),
    tvPrestige: clamp(tv.avgRating ? tv.avgRating * 10 : 40 + ((personId * 3) % 17), 1, 99),
  };
}

function sideFromList(credits: RealCredit[], year: number): CreditSide {
  const rated = credits.filter((credit) => credit.rating > 0);
  const avg = rated.length ? rated.reduce((sum, credit) => sum + credit.rating, 0) / rated.length : 0;
  const recent = credits.filter((credit) => {
    const y = Number(credit.year);
    return Number.isFinite(y) && year - y <= 12;
  }).length;
  return {
    count: credits.length,
    avgRating: avg,
    recent,
    titles: credits.slice(0, 8).map((credit) => ({ title: credit.title, year: credit.year, rating: credit.rating })),
  };
}

function creditMass(side: CreditSide): number {
  if (side.count <= 0) return 0;
  const quality = 0.55 + side.avgRating / 20;
  const recent = 1 + side.recent / side.count;
  return Math.log2(1 + side.count * quality * recent) * 18;
}

function chooseMedium(filmScore: number, tvScore: number): Medium {
  const strong = Math.max(filmScore, tvScore);
  const weak = Math.min(filmScore, tvScore);
  if (strong > 0 && weak >= strong * 0.42 && weak >= 1.2) return "Both";
  if (tvScore > filmScore * 1.12) return "TV";
  return "Film";
}

function hashedProfile(personId: number, popularity: number): { medium: Medium; filmStar: number; tvStar: number; filmPrestige: number; tvPrestige: number } {
  const rng = makeRng((Math.imul(personId || 1, 1597334677) >>> 0) || 1);
  const roll = personId % 5;
  const medium: Medium = roll === 0 ? "TV" : roll === 1 ? "Both" : "Film";
  const pop = Math.log10(popularity + 1) * 22;
  const filmLean = medium === "TV" ? 0.45 : medium === "Both" ? 0.85 : 1;
  const tvLean = medium === "Film" ? 0.4 : medium === "Both" ? 0.85 : 1;
  return {
    medium,
    filmStar: clamp(28 + pop * filmLean + next(rng) * 18, 1, 99),
    tvStar: clamp(28 + pop * tvLean + next(rng) * 18, 1, 99),
    filmPrestige: clamp(42 + next(rng) * 40, 1, 99),
    tvPrestige: clamp(42 + next(rng) * 40, 1, 99),
  };
}

export function applyProfile(person: CatalogPerson, year: number): { medium: Medium; filmStar: number; tvStar: number; filmPrestige: number; tvPrestige: number } {
  return profileFromCredits(person.knownFor, person.popularity, person.id, year, {
    movie: person.movieCredits,
    tv: person.tvCredits,
  });
}

export function backfillClient(client: Client, year: number): void {
  if (!client.medium || client.filmStar == null || client.tvStar == null) {
    const profile = profileFromCredits(client.realCredits ?? [], client.stats?.starPower ?? 40, client.personId, year);
    client.medium ??= profile.medium;
    client.filmStar ??= profile.filmStar;
    client.tvStar ??= profile.tvStar;
    client.filmPrestige ??= profile.filmPrestige;
    client.tvPrestige ??= profile.tvPrestige;
  }
  client.franchises ??= [];
  client.filmStar = clamp(client.filmStar, 1, 99);
  client.tvStar = clamp(client.tvStar, 1, 99);
  client.filmPrestige = clamp(client.filmPrestige ?? 50, 1, 99);
  client.tvPrestige = clamp(client.tvPrestige ?? 50, 1, 99);
}

export function seriesPremium(client: Pick<Client, "medium" | "filmStar" | "tvStar">): number {
  const tv = 0.62 + client.tvStar / 140;
  if (client.medium === "Film" || client.filmStar >= 72) return tv * (1.85 + client.filmStar / 90);
  if (client.medium === "Both") return tv * (1.25 + client.filmStar / 220);
  return tv;
}

export function filmPull(client: Pick<Client, "medium" | "filmStar">, tier: BudgetTier): number {
  const star = 0.42 + client.filmStar / 120;
  if (client.medium === "TV") return star * (tier === "tentpole" || tier === "studio" ? 0.72 : 0.9);
  if (tier === "tentpole") return star * (0.85 + client.filmStar / 160);
  if (tier === "micro-indie" || tier === "indie") return 0.75;
  return star;
}

export function episodeQuote(input: {
  fame: FameTier;
  role: RoleType;
  medium: Medium;
  filmStar: number;
  tvStar: number;
  season: number;
  episodes: number;
  format: SeriesFormat | null;
}): { episodeFee: number; episodes: number; total: number; willingness: string } {
  const episodes = Math.max(1, Math.round(input.episodes));
  const filmStar = input.medium === "Film" || input.filmStar >= 72;
  const seasonBump = 1 + Math.max(0, input.season - 1) * 0.08;
  const raw = EPISODE_BASE[input.fame] * (ROLE_EPISODE[input.role] ?? 0.4) * seriesPremium(input) * seasonBump;
  const episodeFee = Math.max(5_000, Math.round(raw / 1000) * 1000);
  const longOrder = filmStar && episodes >= 12 && (input.role === "Lead" || input.role === "Series Regular");
  const willingness = filmStar
    ? longOrder
      ? "A film star will not take this long network order. They want six to ten episodes, a producer credit, and a fee well above their TV peers."
      : "A film star will consider a series for a short order, a producer credit, and a fee well above their TV peers."
    : input.medium === "TV"
      ? "Television is the home medium. A long order is normal. Film work still has to prove itself."
      : "They work both sides. Volume is higher, and neither medium is a surprise.";
  return { episodeFee, episodes, total: episodeFee * episodes, willingness };
}

export function pickDeal(rng: RngState, role: RoleType, format: SeriesFormat | null): { style: SeriesDealStyle; seasons: number; annualBump: number } {
  if (format === "limited" || format === "miniseries" || format === "anthology") return { style: "single", seasons: 1, annualBump: 0 };
  if (role !== "Lead" && role !== "Series Regular" && role !== "Co-lead") return { style: "single", seasons: 1, annualBump: 0 };
  const roll = next(rng);
  const bump = Math.round((0.05 + next(rng) * 0.07) * 100) / 100;
  if (roll < 0.34) return { style: "guaranteed", seasons: [3, 5, 6, 7][int(rng, 0, 3)]!, annualBump: bump };
  if (roll < 0.68) return { style: "option", seasons: [3, 5, 6][int(rng, 0, 2)]!, annualBump: Math.round(bump * 0.6 * 100) / 100 };
  return { style: "single", seasons: 1, annualBump: 0 };
}

export function bumpedFee(episodeFee: number, annualBump: number, seasonsServed: number): number {
  return Math.max(5_000, Math.round((episodeFee * Math.pow(1 + annualBump, Math.max(0, seasonsServed))) / 1000) * 1000);
}

export function dealBlurb(deal: { style: SeriesDealStyle; seasons: number; annualBump: number }): string {
  if (deal.style === "single") return "One season. They are free when it ends.";
  const pct = Math.round(deal.annualBump * 100);
  if (deal.style === "guaranteed") return `${deal.seasons} seasons guaranteed. Fee bumps ${pct}% a year. The calendar stays locked, and the quote cannot leap to a tentpole.`;
  return `Studio option for up to ${deal.seasons} seasons, ${pct}% bump if they pick it up. They can drop the actor every year. The off-season stays open.`;
}

export function cancellationBuyout(deal: SeriesDeal | undefined, episodes: number): number {
  if (!deal || deal.style !== "guaranteed") return 0;
  const remaining = Math.max(0, deal.seasons - deal.seasonsServed);
  if (remaining <= 0) return 0;
  return Math.round(deal.episodeFee * Math.max(1, episodes) * 0.4 * remaining);
}

export function buildBlocks(role: RoleType, season: Pick<Season, "prepStart" | "shootStart" | "shootWeeks" | "episodes">, rng: RngState): WorkBlock[] {
  if (role === "Lead" || role === "Co-lead" || role === "Series Regular") {
    const end = absWeek(addWeeks(season.shootStart, Math.max(1, season.shootWeeks) - 1));
    const weeks = end - absWeek(season.prepStart) + 1;
    return [{ start: { ...season.prepStart }, weeks, episodes: season.episodes }];
  }
  if (role === "Guest Star") {
    const episodes = Math.min(2, Math.max(1, season.episodes));
    const weeks = episodes;
    const offset = int(rng, 0, Math.max(0, season.shootWeeks - weeks));
    return [{ start: addWeeks(season.shootStart, offset), weeks, episodes }];
  }
  const episodes = Math.max(1, Math.min(season.episodes, Math.round(season.episodes * 0.5)));
  const two = episodes >= 6 && season.shootWeeks >= 8 && chance(rng, 0.65);
  if (!two) {
    const weeks = Math.max(1, Math.min(season.shootWeeks - 1, Math.round(season.shootWeeks * (episodes / Math.max(1, season.episodes)))));
    const offset = int(rng, 0, Math.max(0, season.shootWeeks - weeks));
    return [{ start: addWeeks(season.shootStart, offset), weeks, episodes }];
  }
  const firstEps = Math.max(1, Math.round(episodes * 0.5));
  const secondEps = Math.max(1, episodes - firstEps);
  const firstWeeks = Math.max(1, Math.round(firstEps * 0.8));
  const secondWeeks = Math.max(1, Math.round(secondEps * 0.8));
  const gap = Math.max(1, season.shootWeeks - firstWeeks - secondWeeks);
  return [
    { start: { ...season.shootStart }, weeks: firstWeeks, episodes: firstEps },
    { start: addWeeks(season.shootStart, firstWeeks + gap - 1), weeks: secondWeeks, episodes: secondEps },
  ];
}

export function blockIntervals(blocks: WorkBlock[]): { start: number; end: number }[] {
  return blocks.map((block) => ({
    start: absWeek(block.start),
    end: absWeek(addWeeks(block.start, Math.max(1, block.weeks) - 1)),
  }));
}

export function blocksOverlap(blocks: WorkBlock[]): boolean {
  const intervals = blockIntervals(blocks);
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i]!;
      const b = intervals[j]!;
      if (a.start <= b.end && b.start <= a.end) return true;
    }
  }
  return false;
}

export function tentpoleBonuses(fee: number, tier: BudgetTier, fame: FameTier): BoxBonus[] {
  if (tier !== "tentpole" && tier !== "studio") return [];
  if (fame !== "A-list" && fame !== "Icon" && fee < 2_000_000) return [];
  return [
    { multiple: 2, amount: Math.round(fee * 0.15) },
    { multiple: 3, amount: Math.round(fee * 0.25) },
  ];
}

export function backendPoints(fame: FameTier, tier: BudgetTier, filmStar: number, existing: number): number {
  if ((fame === "A-list" || fame === "Icon") && tier === "tentpole" && filmStar >= 70) return Math.max(existing, fame === "Icon" ? 8 : 5);
  return existing;
}

export function offerKindBias(client: Pick<Client, "medium">): number {
  if (client.medium === "TV") return 0.28;
  if (client.medium === "Both") return 0.5;
  return 0.82;
}

export function growFilmStar(client: Client, tier: BudgetTier, profit: string | undefined, weight: number): number {
  const hit = profit === "blockbuster" ? 8 : profit === "hit" ? 4 : 0;
  const miss = profit === "bomb" ? -6 : profit === "flop" ? -3 : 0;
  const tentpole = tier === "tentpole" ? 1.4 : 1;
  return Math.round((hit + miss) * tentpole * Math.max(0.3, weight));
}

export function seriesStatus(project: Project, date: GameDate): string {
  if (project.cancelled || project.pilot?.status === "passed") return "cancelled";
  if (project.ended) return "ended";
  if (project.pilot?.status === "awaiting" || project.pilot?.status === "shooting" || project.pilot?.status === "retooled") return "pilot";
  const season = project.seasons[project.seasons.length - 1];
  if (!season) return "in development";
  const now = absWeek(date);
  const prep = absWeek(season.prepStart);
  const shootEnd = absWeek(addWeeks(season.shootStart, Math.max(1, season.shootWeeks) - 1));
  const premiere = absWeek(season.premiere);
  if (season.renewal === "pending" && now > premiere && season.episodesAired >= season.episodes) return "renewal pending";
  if (now >= prep && now <= shootEnd) return "in production";
  if (now >= premiere && season.episodesAired < season.episodes) return "airing";
  if (season.renewal === "cancelled") return "cancelled";
  if (season.renewal === "finale") return "ended";
  if (now > shootEnd && now < premiere) return "between seasons";
  if (now > premiere) return "between seasons";
  return "in production";
}

export function yearsRunning(project: Project): string {
  const years = project.seasons.flatMap((season) => [season.producedYear, season.releasedYear].filter((year): year is number => Boolean(year)));
  if (years.length === 0) {
    const start = project.seasons[0]?.shootStart.year ?? project.shootStart.year;
    const end = project.seasons[project.seasons.length - 1]?.premiere.year ?? project.release.year;
    return start === end ? String(start) : `${start}-${end}`;
  }
  const start = Math.min(...years);
  const end = Math.max(...years);
  return start === end ? String(start) : `${start}-${end}`;
}

export function seasonCast(project: Project, season: Season): { personId: number; name: string; role: RoleType; episodes: number; fee: number }[] {
  return project.cast
    .filter((member) => !member.writtenOut && (member.seasonNumber == null || member.seasonNumber <= season.number))
    .map((member) => ({
      personId: member.personId,
      name: member.name,
      role: member.role,
      episodes: member.episodes ?? season.episodes,
      fee: member.episodeFee ?? member.fee,
    }));
}

export function seriesHistory(state: GameState, personId: number): {
  projectId: string;
  title: string;
  role: RoleType;
  seasons: string;
  years: string;
  episodes: number;
  earnings: number;
  network: string | null;
}[] {
  const rows = [];
  for (const project of state.projects) {
    if (project.kind !== "series") continue;
    const member = project.cast.find((row) => row.personId === personId);
    if (!member) continue;
    const worked = project.seasons.filter((season) => member.seasonNumber == null || season.number >= member.seasonNumber);
    if (worked.length === 0) continue;
    const numbers = worked.map((season) => season.number);
    const years = worked.flatMap((season) => [season.producedYear ?? season.shootStart.year, season.releasedYear ?? season.premiere.year]);
    const episodes = worked.reduce((sum, season) => sum + (member.episodes ?? season.episodes), 0);
    const earnings = worked.reduce((sum, season) => sum + (member.episodeFee ?? 0) * (member.episodes ?? season.episodes), 0);
    rows.push({
      projectId: project.id,
      title: project.title,
      role: member.role,
      seasons: numbers.length === 1 ? `Season ${numbers[0]}` : `Seasons ${numbers[0]}-${numbers[numbers.length - 1]}`,
      years: years.length ? `${Math.min(...years)}-${Math.max(...years)}` : "",
      episodes,
      earnings: earnings || member.fee,
      network: project.network,
    });
  }
  return rows;
}

export function filmHistory(state: GameState, personId: number): { projectId: string; title: string; year: number; role: RoleType; gross?: number; critic?: number }[] {
  return state.projects
    .filter((project) => project.kind === "film" && project.cast.some((member) => member.personId === personId))
    .map((project) => ({
      projectId: project.id,
      title: project.title,
      year: project.release.year,
      role: project.cast.find((member) => member.personId === personId)!.role,
      gross: project.totalGross,
      critic: project.criticScore,
    }));
}

export function rollPilotOutcome(rng: RngState): "picked_up" | "passed" | "retooled" {
  const roll = next(rng);
  if (roll < 0.46) return "picked_up";
  if (roll < 0.84) return "passed";
  return "retooled";
}

export function shouldRecast(rng: RngState): boolean {
  return chance(rng, 0.5);
}

export function bucketFromLabel(label: string): "film" | "series" | "pilot" | "bonus" | "overhead" | "other" {
  const text = label.toLowerCase();
  if (text.includes("overhead") || text.includes("rent") || text.includes("salar")) return "overhead";
  if (text.includes("bonus") || text.includes("backend")) return "bonus";
  if (text.includes("pilot")) return "pilot";
  if (text.includes("episode") || text.includes("series") || text.includes("season")) return "series";
  if (text.includes("commission")) return "film";
  return "other";
}

export function migrateCareer(state: GameState): void {
  state.lastAutosave ??= { ...state.date };
  for (const client of state.clients) backfillClient(client, state.date.year);
  for (const hold of state.holds ?? []) hold.kind ??= "personal";
  for (const entry of state.ledger ?? []) entry.bucket ??= bucketFromLabel(entry.label);
  for (const project of state.projects) {
    if (project.kind === "series" && !project.origin) {
      project.origin = project.format === "limited" || project.format === "miniseries" ? "limited" : "straight";
    }
    for (const season of project.seasons) {
      season.producedYear ??= season.shootStart?.year;
      season.releasedYear ??= season.premiere?.year;
    }
    for (const member of project.cast) {
      if (project.kind === "series" && member.episodeFee == null && (member.role === "Lead" || member.role === "Series Regular" || member.role === "Recurring" || member.role === "Guest Star")) {
        const episodes = project.seasons[0]?.episodes ?? 8;
        member.episodes ??= member.role === "Guest Star" ? Math.min(2, episodes) : member.role === "Recurring" ? Math.max(1, Math.round(episodes / 2)) : episodes;
        member.episodeFee ??= Math.max(5_000, Math.round(member.fee / Math.max(1, member.episodes)));
      }
    }
  }
}

export function longOrderRefusal(client: Client, role: RoleType, episodes: number): string | null {
  if (!(client.medium === "Film" || client.filmStar >= 72)) return null;
  if (role !== "Lead" && role !== "Series Regular") return null;
  if (episodes < 12) return null;
  return `${client.name} will not take a ${episodes}-episode order. They want a limited series, six to ten episodes, and the fee has to look like film money.`;
}
