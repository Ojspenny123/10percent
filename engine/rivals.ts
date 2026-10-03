import { RIVALS } from "./constants";
import { makeRng, next, pick } from "./rng";
import type { Catalog, GameState, Rival, RivalSize } from "./types";
import { CITIES, cityById } from "./places";

const FIRST = ["Alden", "Briar", "Calder", "Dove", "Ellison", "Farrow", "Greer", "Hart", "Ives", "June", "Keller", "Lang", "Moss", "North", "Oak", "Pell", "Quill", "Rowe", "Sable", "Vale", "Wynn", "York"];
const SECOND = ["Ash", "Bell", "Crowe", "Dane", "Ellis", "Frost", "Grey", "Holt", "Ivory", "Jade", "Knox", "Lane", "Marlow", "Nash", "Pike", "Reed", "Shaw", "Thorn", "Underwood", "Voss", "West", "Young"];
const TAILS = ["Artists", "Talent", "Management", "& Partners", "Collective", "Pictures", "Clients", "and Co"];
const SPECIALTIES = ["Film", "TV", "Both", "Directors", "Horror", "Comedy", "Prestige", "International", "Emerging"];
const STRATEGIES = ["Poacher", "Developer", "Prestige", "Commercial", "Cautious"];

const CITY_WEIGHT = CITIES.map((city) => (city.hub === "major" ? 8 : city.hub === "secondary" ? 3 : 1));

export function rivalHolding(state: GameState, personId: number): Rival | undefined {
  const client = state.clients.find((row) => row.personId === personId && row.agency === "rival");
  if (client?.rivalId) return state.rivals.find((row) => row.id === client.rivalId);
  return state.rivals.find((row) => row.notableIds?.includes(personId));
}

export function leagueScore(rival: { reputation: number; rosterCount?: number; revenue?: number; awards?: number; boxOffice?: number; clients?: { stats: { starPower: number } }[] }): number {
  const stars = rival.clients?.reduce((sum, client) => sum + client.stats.starPower, 0) ?? 0;
  return Math.round(rival.reputation * 2 + stars + (rival.rosterCount ?? 0) * 0.4 + (rival.revenue ?? 0) / 1_000_000 + (rival.awards ?? 0) * 8 + (rival.boxOffice ?? 0) / 5_000_000);
}

export function ensureRivalField(state: GameState, catalog?: Catalog): void {
  if (state.rivals.length >= 30 && state.rivals.every((row) => row.cityId && row.size)) {
    if (catalog && catalog.actors.length >= 400) assignNotables(state, catalog);
    return;
  }
  const rng = makeRng((state.seed ^ 0x7a11) >>> 0 || 1);
  const existing = new Set(state.rivals.map((row) => row.name.toLowerCase()));
  for (const rival of state.rivals) {
    rival.cityId ??= rival.id === "northvale" ? "new-york" : rival.id === "atlas" ? "london" : "los-angeles";
    rival.size ??= "mega";
    rival.founded ??= 1978;
    rival.specialty ??= "Both";
    rival.strategy ??= "Poacher";
    rival.cash ??= 40_000_000;
    rival.health ??= 70;
    rival.relationship ??= 0;
    rival.rosterCount ??= 120;
    rival.revenue ??= 25_000_000;
    rival.awards ??= 6;
    rival.boxOffice ??= 400_000_000;
    rival.monogram ??= monogram(rival.name);
    rival.notableIds ??= [];
  }
  const target = 36 + Math.floor(next(rng) * 12);
  let guard = 0;
  while (state.rivals.length < target && guard < 80) {
    guard += 1;
    const name = inventName(rng);
    if (existing.has(name.toLowerCase())) continue;
    existing.add(name.toLowerCase());
    const city = weightedCity(rng);
    const size = sizeFor(state.rivals.length);
    state.rivals.push(blankRival(rng, name, city, size, state.date.year));
  }
  if (!state.rivals.some((row) => row.id === "meridian")) {
    for (const seed of RIVALS) {
      if (!state.rivals.some((row) => row.id === seed.id)) {
        state.rivals.unshift({ ...seed, reputation: 42, cityId: "los-angeles", size: "mega", rosterCount: 80, notableIds: [] });
      }
    }
  }
  if (catalog && catalog.actors.length >= 400) assignNotables(state, catalog);
}

function inventName(rng: ReturnType<typeof makeRng>): string {
  const pattern = Math.floor(next(rng) * 4);
  const a = pick(rng, FIRST);
  const b = pick(rng, SECOND);
  const tail = pick(rng, TAILS);
  if (pattern === 0) return `${a} & ${b}`;
  if (pattern === 1) return `${a} ${tail}`;
  if (pattern === 2) return `${b} ${tail}`;
  return `${a}${b}`;
}

function weightedCity(rng: ReturnType<typeof makeRng>): string {
  const total = CITY_WEIGHT.reduce((sum, n) => sum + n, 0);
  let roll = next(rng) * total;
  for (let i = 0; i < CITIES.length; i++) {
    roll -= CITY_WEIGHT[i] ?? 1;
    if (roll <= 0) return CITIES[i]!.id;
  }
  return "los-angeles";
}

function sizeFor(index: number): RivalSize {
  if (index < 4) return "mega";
  if (index < 16) return "mid";
  return "boutique";
}

function blankRival(rng: ReturnType<typeof makeRng>, name: string, cityId: string, size: RivalSize, year: number): Rival {
  const city = cityById(cityId);
  const roster = size === "mega" ? 90 + Math.floor(next(rng) * 80) : size === "mid" ? 28 + Math.floor(next(rng) * 40) : 8 + Math.floor(next(rng) * 16);
  return {
    id: `r_${name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 18)}_${Math.floor(next(rng) * 999)}`,
    name,
    reputation: size === "mega" ? 62 : size === "mid" ? 44 : 28,
    blurb: `${size === "boutique" ? "A small shop" : size === "mid" ? "A steady shop" : "A huge shop"} in ${city?.city ?? "town"}. ${pick(rng, STRATEGIES).toLowerCase()} by habit.`,
    cityId,
    founded: year - 5 - Math.floor(next(rng) * 40),
    size,
    specialty: pick(rng, SPECIALTIES),
    strategy: pick(rng, STRATEGIES),
    cash: roster * (size === "mega" ? 80_000 : 25_000),
    health: 40 + Math.floor(next(rng) * 50),
    relationship: 0,
    rosterCount: roster,
    notableIds: [],
    revenue: roster * 120_000,
    awards: size === "mega" ? 4 : 0,
    boxOffice: roster * 2_000_000,
    monogram: monogram(name),
    nemesis: false,
  };
}

function monogram(name: string): string {
  const parts = name.split(/\s+/).filter((part) => part !== "&" && part !== "and");
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "RA";
}

function assignNotables(state: GameState, catalog: Catalog): void {
  if (state.rivals.every((row) => (row.notableIds?.length ?? 0) > 0)) return;
  const taken = new Set(state.clients.filter((client) => client.agency === "player").map((client) => client.personId));
  const ranked = [...catalog.actors].sort((a, b) => b.popularity - a.popularity);
  const rng = makeRng((state.seed ^ 0x51a7) >>> 0 || 1);
  for (const rival of state.rivals) {
    if ((rival.notableIds?.length ?? 0) > 0) continue;
    const city = cityById(rival.cityId);
    const want = rival.size === "mega" ? 8 : rival.size === "mid" ? 5 : 3;
    const pool = ranked.filter((actor) => {
      if (taken.has(actor.id)) return false;
      if (!city) return true;
      return !actor.nationality || sameCountry(actor.nationality, city.country) || rival.size === "mega";
    });
    const picks: number[] = [];
    const copy = pool.slice(0, 80);
    while (picks.length < want && copy.length) {
      const index = Math.floor(next(rng) * copy.length);
      const person = copy.splice(index, 1)[0];
      if (!person || taken.has(person.id)) continue;
      taken.add(person.id);
      picks.push(person.id);
    }
    rival.notableIds = picks;
  }
}

export function sameCountry(nationality: string | null, country: string): boolean {
  if (!nationality) return false;
  const text = nationality.toLowerCase();
  const target = country.toLowerCase();
  if (target.startsWith("united states")) return /united states|\busa\b|\bu\.s\b|america/.test(text);
  if (target.startsWith("united kingdom")) return /united kingdom|\buk\b|england|scotland|wales|britain/.test(text);
  if (target === "south korea") return /korea/.test(text);
  if (target === "south africa") return /south africa/.test(text);
  if (target === "united arab emirates") return /emirates|\buae\b|dubai/.test(text);
  return text.includes(target.split(" ")[0] ?? target);
}

export function tickRivals(state: GameState): void {
  const rng = makeRng(((state.seed + state.date.year * 52 + state.date.week) ^ 0x21c3) >>> 0 || 1);
  for (const rival of state.rivals) {
    const drift = next(rng) - 0.48;
    rival.reputation = Math.max(8, Math.min(96, Math.round((rival.reputation ?? 40) + drift * 2)));
    rival.health = Math.max(5, Math.min(100, Math.round((rival.health ?? 50) + (next(rng) - 0.5) * 6)));
    rival.cash = Math.max(0, Math.round((rival.cash ?? 500_000) * (0.97 + next(rng) * 0.07)));
    rival.revenue = Math.round((rival.revenue ?? 0) + (rival.rosterCount ?? 10) * 1500 * next(rng));
    rival.relationship = Math.max(-80, Math.min(80, (rival.relationship ?? 0) + (next(rng) < 0.5 ? -1 : 0)));
  }
  if (next(rng) < 0.04) mergeBoutiques(state, rng);
  if (next(rng) < 0.03) collapseOne(state, rng);
  if (next(rng) < 0.05) openBoutique(state, rng);
  if (next(rng) < 0.08) rivalNews(state, rng);
}

function mergeBoutiques(state: GameState, rng: ReturnType<typeof makeRng>): void {
  const pool = state.rivals.filter((row) => row.size === "boutique" && !row.id.startsWith("meridian") && row.id !== "northvale" && row.id !== "atlas");
  if (pool.length < 2) return;
  const a = pick(rng, pool);
  const b = pool.find((row) => row.id !== a.id);
  if (!b) return;
  a.rosterCount = (a.rosterCount ?? 0) + (b.rosterCount ?? 0);
  a.cash = (a.cash ?? 0) + (b.cash ?? 0);
  a.name = a.name.includes("&") ? a.name : `${a.name.split(" ")[0]} & ${b.name.split(" ")[0]}`;
  a.notableIds = [...(a.notableIds ?? []), ...(b.notableIds ?? [])].slice(0, 12);
  state.rivals = state.rivals.filter((row) => row.id !== b.id);
  for (const client of state.clients) if (client.rivalId === b.id) client.rivalId = a.id;
  note(state, `${b.name} folded into ${a.name}.`);
}

function collapseOne(state: GameState, rng: ReturnType<typeof makeRng>): void {
  const weak = state.rivals.filter((row) => (row.health ?? 50) < 25 && row.size === "boutique" && row.id !== "meridian");
  if (!weak.length) return;
  const gone = pick(rng, weak);
  const heir = state.rivals.find((row) => row.id !== gone.id);
  state.rivals = state.rivals.filter((row) => row.id !== gone.id);
  for (const client of state.clients) {
    if (client.rivalId === gone.id && heir) client.rivalId = heir.id;
  }
  note(state, `${gone.name} closed. The roster moved to ${heir?.name ?? "another shop"}.`);
}

function openBoutique(state: GameState, rng: ReturnType<typeof makeRng>): void {
  if (state.rivals.length >= 60) return;
  const name = inventName(rng);
  if (state.rivals.some((row) => row.name === name)) return;
  const city = state.agency.cityId ?? "los-angeles";
  state.rivals.push(blankRival(rng, name, city, "boutique", state.date.year));
  note(state, `${name} opened a boutique in ${cityById(city)?.city ?? "town"}.`);
}

function rivalNews(state: GameState, rng: ReturnType<typeof makeRng>): void {
  const rival = pick(rng, state.rivals);
  const line = pick(rng, [
    `${rival.name} signed a hot unsigned actor.`,
    `${rival.name} dropped a client who was not working.`,
    `${rival.name} is spending on its own productions.`,
  ]);
  note(state, line);
  // Project and pilot rolls are salted from ids minted off state.seq. Rival headlines must not bump it.
  state.news.unshift({
    id: `rivalnews_${state.date.year}_${state.date.week}_${rival.id}`,
    date: { ...state.date },
    headline: rival.name,
    body: line,
  });
}

function note(state: GameState, text: string): void {
  state.rivalNotes ??= [];
  state.rivalNotes.unshift({ date: { ...state.date }, text });
  if (state.rivalNotes.length > 40) state.rivalNotes.length = 40;
}
