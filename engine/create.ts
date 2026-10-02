import { ERA_START, GENRES, RIVALS } from "./constants";
import { scoreFilm } from "./results";
import { agencyTier, clientFromCatalog, isEligible } from "./people";
import { makeRng } from "./rng";
import { spawnFilm } from "./generate";
import type { Catalog, Era, GameState } from "./types";

export function createGame(input: { agencyName: string; era: Era; seed: number; catalog: Catalog }): GameState {
  const name = input.agencyName.trim();
  if (name.length < 2) throw new Error("Give the agency a name.");
  const startYear = ERA_START[input.era];
  const eligible = input.catalog.actors.filter((actor) => isEligible(actor, input.era, startYear));
  const directors = input.catalog.directors.filter((director) => !director.deathday || Number(director.deathday.slice(0, 4)) >= startYear);
  if (eligible.length < 24) throw new Error("Not enough eligible actors for this era. Seed TMDB data first.");
  if (directors.length < 8) throw new Error("Not enough directors in the cache. Seed TMDB data first.");
  const catalog: Catalog = { actors: eligible, directors };
  const trends: Record<string, number> = {};
  for (const genre of GENRES) trends[genre] = 1;
  const state: GameState = {
    version: 1,
    seed: input.seed >>> 0 || 1,
    rng: makeRng(input.seed >>> 0 || 1),
    seq: 1,
    era: input.era,
    date: { year: startYear, week: 1 },
    agency: {
      name,
      cash: 400_000,
      reputation: 16,
      tier: agencyTier(16),
      staff: [],
      rent: 12_000,
    },
    rivals: RIVALS.map((rival) => ({ ...rival, reputation: 42 })),
    clients: [],
    projects: [],
    offers: [],
    approaches: [],
    events: [],
    inbox: [],
    news: [],
    awards: [],
    festivals: [],
    holds: [],
    brandDeals: [],
    ledger: [],
    genreTallies: {},
    genreTrends: trends,
    usedTitles: [],
    lastTurn: ["The agency is open. Scout someone, or wait for them to call."],
    insolventWeeks: 0,
    ceremoniesRun: [],
  };
  state.ledger.push({ date: { ...state.date }, label: "Opening cash", amount: 400_000, balance: 400_000 });
  const ranked = [...eligible].sort((a, b) => b.popularity - a.popularity);
  ranked.slice(0, 36).forEach((person, index) => {
    const rival = state.rivals[index % state.rivals.length]!;
    const client = clientFromCatalog(person, "rival", state.date, rival.id);
    client.contract = { commission: 10, start: { ...state.date }, termYears: 3, exclusive: true, exitClause: false };
    client.loyalty = 55 + (index % 20);
    state.clients.push(client);
  });
  for (let i = 0; i < 40; i++) {
    const film = spawnFilm(state, catalog, { historical: true, excludePeople: new Set(state.clients.map((c) => c.personId)) });
    if (!film) continue;
    film.historical = true;
    film.phase = "released";
    film.ended = true;
    if (film.cast.length === 0) {
      film.cancelled = true;
      continue;
    }
    scoreFilm(state, film);
  }
  state.news.unshift({
    id: `news_${state.seq++}`,
    date: { ...state.date },
    headline: `${name} opens its doors`,
    body: `A new shop in a ${input.era === "today" ? "2026" : input.era} market. Ten percent, if you can get it.`,
  });
  state.inbox.unshift({
    id: `in_${state.seq++}`,
    date: { ...state.date },
    kind: "system",
    title: `Welcome to ${name}`,
    body: "Sign a client from Talent, then take or counter the offers that follow. One project at a time during prep and shooting.",
    href: "/talent",
    read: false,
  });
  return state;
}
