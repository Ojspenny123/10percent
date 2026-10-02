import { ERA_START } from "./constants";
import { applyProfile } from "./career";
import { makeRng, next } from "./rng";
import type {
  ActorStats,
  AgencySide,
  AgencyTier,
  CareerStage,
  CatalogPerson,
  Client,
  Era,
  BudgetTier,
  FameTier,
  GameDate,
  HiddenTraits,
  Mood,
  Preference,
  RoleType,
} from "./types";

export function clamp(n: number, min = 1, max = 99): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function clampFloat(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function monthIndex(week: number): number {
  return Math.min(11, Math.floor(((week - 1) * 12) / 52));
}

export function ageOn(birthday: string | null, date: GameDate): number | null {
  if (!birthday || birthday.length < 4) return null;
  const year = Number(birthday.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  let age = date.year - year;
  const month = Number(birthday.slice(5, 7));
  if (Number.isFinite(month) && month > 0) {
    const gameMonth = monthIndex(date.week) + 1;
    if (month > gameMonth) age -= 1;
  }
  return age;
}

export function isEligible(person: CatalogPerson, era: Era, startYear = ERA_START[era]): boolean {
  if (person.deathday) {
    const deathYear = Number(person.deathday.slice(0, 4));
    if (Number.isFinite(deathYear) && deathYear < startYear) return false;
    if (era === "today" && Number.isFinite(deathYear)) return false;
  }
  const age = ageOn(person.birthday, { year: startYear, week: 26 });
  if (age == null) return false;
  return age >= 16 && age <= 78;
}

export function preferredGenres(mix: Record<string, number>): string[] {
  return Object.entries(mix)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
}

function jitter(id: number, salt: number): number {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 8 - 4;
}

const MAJOR_MARKETS = new Set([
  "USA",
  "United States",
  "US",
  "United States of America",
  "UK",
  "United Kingdom",
  "England",
  "Canada",
  "Australia",
  "France",
  "Germany",
  "India",
  "Japan",
  "South Korea",
  "Mexico",
  "Brazil",
  "Italy",
  "Spain",
]);

export function seedStats(person: CatalogPerson): { stats: ActorStats; why: Record<keyof ActorStats, string> } {
  const genresUsed = Object.values(person.genreMix).filter((n) => n >= 2).length;
  const talentBase = (person.avgRating - 4.2) * 18 + Math.min(8, person.creditCount / 12);
  const talent = clamp(talentBase + jitter(person.id, 1));
  const pop = Math.max(0, person.popularity);
  const starBase = Math.log10(pop + 1) * 32 + Math.min(22, person.creditCount / 3);
  const starPower = clamp(starBase + jitter(person.id, 2));
  const marketBoost = MAJOR_MARKETS.has(person.nationality ?? "") ? 8 : 0;
  const marketability = clamp(starPower * 0.62 + marketBoost + Math.min(16, genresUsed * 3) + jitter(person.id, 3));
  const range = clamp(22 + genresUsed * 11 + jitter(person.id, 4));
  const buzz = clamp(18 + Math.log10(pop + 1) * 18 + jitter(person.id, 5), 5, 90);
  const reputation = clamp(58 + Math.min(18, person.creditCount / 6) - (pop > 120 ? 6 : 0) + jitter(person.id, 6));
  return {
    stats: { talent, starPower, marketability, range, buzz, reputation },
    why: {
      talent: `Seeded from an average credit rating of ${person.avgRating.toFixed(1)} across ${person.creditCount} credits.`,
      starPower: `Seeded from TMDB popularity ${pop.toFixed(1)} and ${person.creditCount} credits.`,
      marketability: `Seeded from popularity, credit breadth${marketBoost ? ", and a major production market" : ""}.`,
      range: `Seeded from ${genresUsed} genres they have worked in more than once.`,
      buzz: "Opening buzz, from how visible they are right now. It decays every week.",
      reputation: "Opening reliability, from a long credit list. Difficult heat can pull it down.",
    },
  };
}

export function traitsFor(id: number): HiddenTraits {
  const rng = makeRng((Math.imul(id, 2654435761) >>> 0) || 1);
  const roll = () => 15 + Math.floor(next(rng) * 80);
  return {
    ambition: roll(),
    loyalty: roll(),
    greed: roll(),
    prestigeVsMoney: Math.floor(next(rng) * 100),
    riskAppetite: Math.floor(next(rng) * 100),
  };
}

export function traitHints(traits: HiddenTraits): string[] {
  const hints: string[] = [];
  if (traits.ambition >= 72) hints.push("Hungry for a bigger stage. Billing matters more than they admit.");
  else if (traits.ambition <= 30) hints.push("Doesn't chase the room. Comfortable work is a real argument.");
  if (traits.greed >= 72) hints.push("Money comes up early, and they remember a low quote.");
  else if (traits.greed <= 28) hints.push("The fee is rarely the thing that makes or breaks a yes.");
  if (traits.prestigeVsMoney >= 70) hints.push("Talks about the work, the director, the script. Not the size of the buy.");
  else if (traits.prestigeVsMoney <= 28) hints.push("A wide release and a clean check beat a darling that nobody sees.");
  if (traits.loyalty >= 72) hints.push("Slow to shop around. They stick if the agency sticks.");
  else if (traits.loyalty <= 30) hints.push("Keeps an eye on other shops. Loyalty has to be earned weekly.");
  if (traits.riskAppetite >= 72) hints.push("Will take the strange one if the upside is real.");
  else if (traits.riskAppetite <= 28) hints.push("Prefers a known genre and a finished script.");
  if (hints.length === 0) hints.push("Even-keeled. No single lever obviously runs them.");
  return hints;
}

export function dominantTrait(traits: HiddenTraits): "ambitious" | "loyal" | "greedy" | "art" | "bold" | "steady" {
  const entries: { key: "ambitious" | "loyal" | "greedy" | "art" | "bold"; value: number }[] = [
    { key: "ambitious", value: traits.ambition },
    { key: "loyal", value: traits.loyalty },
    { key: "greedy", value: traits.greed },
    { key: "art", value: traits.prestigeVsMoney },
    { key: "bold", value: traits.riskAppetite },
  ];
  entries.sort((a, b) => b.value - a.value);
  if ((entries[0]?.value ?? 0) < 60) return "steady";
  return entries[0]!.key;
}

export function fameFromStar(starPower: number, wins: number): FameTier {
  const score = starPower + wins * 5;
  if (score >= 90) return "Icon";
  if (score >= 74) return "A-list";
  if (score >= 54) return "Known";
  if (score >= 34) return "Working";
  return "Unknown";
}

export function fameScore(stats: ActorStats, wins: number): number {
  return clamp(stats.starPower * 0.62 + stats.buzz * 0.18 + stats.talent * 0.12 + wins * 4, 1, 100);
}

export function careerStageFor(age: number | null, starPower: number, delta: number): CareerStage {
  if (age != null && age >= 48 && delta >= 8 && starPower >= 48) return "Comeback";
  if (age != null && age < 26 && starPower < 58) return starPower >= 40 ? "Rising" : "Newcomer";
  if (starPower >= 72 && (age == null || (age >= 28 && age <= 52))) return "Peak";
  if (age != null && age >= 55 && starPower >= 60) return "Established";
  if (age != null && age >= 52 && starPower < 42) return "Declining";
  if (starPower >= 50) return "Rising";
  if (age != null && age >= 60) return "Established";
  return starPower >= 36 ? "Rising" : "Newcomer";
}

export function agencyTier(reputation: number): AgencyTier {
  if (reputation >= 80) return "Powerhouse";
  if (reputation >= 60) return "Major";
  if (reputation >= 40) return "Established";
  if (reputation >= 22) return "Rising";
  return "Boutique";
}

export function rosterCap(tier: AgencyTier): number {
  if (tier === "Powerhouse") return 72;
  if (tier === "Major") return 48;
  if (tier === "Established") return 32;
  if (tier === "Rising") return 20;
  return 12;
}

export function moodFromStars(stars: number): Mood {
  if (stars >= 5) return "Thrilled";
  if (stars >= 4) return "Content";
  if (stars >= 3) return "Uneasy";
  if (stars >= 2) return "Unhappy";
  return "Furious";
}

export function driftMood(mood: Mood): Mood {
  const order: Mood[] = ["Furious", "Unhappy", "Uneasy", "Content", "Thrilled"];
  const idx = order.indexOf(mood);
  if (idx < 0 || mood === "Content") return "Content";
  if (idx > order.indexOf("Content")) return order[idx - 1] ?? "Content";
  return order[idx + 1] ?? "Content";
}

const ROLE_MULT: Record<RoleType, number> = {
  Lead: 1,
  "Co-lead": 0.72,
  Supporting: 0.34,
  Cameo: 0.08,
  "Series Regular": 0.62,
  Recurring: 0.28,
  "Guest Star": 0.1,
};

const FAME_FEE: Record<FameTier, number> = {
  Unknown: 40_000,
  Working: 200_000,
  Known: 480_000,
  "A-list": 8_500_000,
  Icon: 22_000_000,
};

export function expectedFee(fame: FameTier, role: RoleType, tier: BudgetTier): number {
  const tierMult: Record<BudgetTier, number> = {
    "micro-indie": 0.14,
    indie: 0.32,
    mid: 1.05,
    studio: 1.55,
    tentpole: 2.6,
  };
  let raw = FAME_FEE[fame] * ROLE_MULT[role] * tierMult[tier];
  const lead = role === "Lead" || role === "Co-lead";
  if (lead && (fame === "Working" || fame === "Known")) raw = Math.min(1_500_000, Math.max(50_000, raw));
  if (lead && fame === "A-list" && (tier === "mid" || tier === "studio" || tier === "tentpole")) raw = Math.min(25_000_000, Math.max(5_000_000, raw));
  if (lead && fame === "Icon" && (tier === "studio" || tier === "tentpole")) raw = Math.min(65_000_000, Math.max(20_000_000, raw));
  if (lead && (fame === "A-list" || fame === "Icon") && (tier === "micro-indie" || tier === "indie")) {
    raw = Math.min(fame === "Icon" ? 8_000_000 : 4_000_000, raw);
  }
  return Math.max(5_000, Math.round(raw / 1000) * 1000);
}

export function genreFit(preferred: string[], genres: string[], range: number): number {
  if (genres.length === 0) return 50;
  const hits = genres.filter((g) => preferred.includes(g)).length;
  if (hits > 0) return clamp(68 + hits * 12, 1, 100);
  if (range >= 70) return 58;
  if (range >= 45) return 42;
  return 28;
}

export function genderLabel(gender: number): string {
  if (gender === 1) return "Female";
  if (gender === 2) return "Male";
  if (gender === 3) return "Non-binary";
  return "Unspecified";
}

export function awardTrack(gender: number): "actor" | "actress" | "open" {
  if (gender === 1) return "actress";
  if (gender === 2) return "actor";
  return "open";
}

export function preferenceLabel(pref: Preference): string {
  if (pref === "prestige") return "Asking for prestige next";
  if (pref === "commercial") return "Wants a commercial swing next";
  return "Open on the next job";
}

export function roleWeight(role: RoleType): number {
  return ROLE_MULT[role];
}

export function clientFromCatalog(person: CatalogPerson, agency: AgencySide, date: GameDate, rivalId: string | null): Client {
  const seeded = seedStats(person);
  const traits = traitsFor(person.id);
  const wins = 0;
  const profile = applyProfile(person, date.year);
  return {
    personId: person.id,
    name: person.name,
    profilePath: person.profilePath,
    gender: person.gender,
    nationality: person.nationality,
    birthday: person.birthday,
    deathday: person.deathday,
    preferredGenres: preferredGenres(person.genreMix),
    stats: seeded.stats,
    statWhy: seeded.why,
    traits,
    revealedHints: [],
    fame: fameFromStar(seeded.stats.starPower, wins),
    careerStage: careerStageFor(ageOn(person.birthday, date), seeded.stats.starPower, 0),
    mood: "Content",
    loyalty: traits.loyalty,
    agency,
    rivalId,
    contract: null,
    history: [{ year: date.year, week: date.week, score: fameScore(seeded.stats, wins) }],
    awards: [],
    verdicts: [],
    nextPreference: "none",
    realCredits: person.knownFor.slice(0, 12),
    studioHeat: {},
    overrides: 0,
    unhappyStreak: 0,
    medium: profile.medium,
    filmStar: profile.filmStar,
    tvStar: profile.tvStar,
    filmPrestige: profile.filmPrestige,
    tvPrestige: profile.tvPrestige,
    franchises: [],
  };
}
