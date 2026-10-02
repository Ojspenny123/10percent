import { describe, expect, it } from "vitest";
import { acceptOffer, counterOffer, signClient } from "./actions";
import { GENRES } from "./constants";
import { createGame } from "./create";
import { fixtureCatalog } from "./fixture";
import { genreTotal, spawnFilm, spawnSeries } from "./generate";
import { isEligible } from "./people";
import { makeRng, next } from "./rng";
import { decideRenewal, shouldWriteOut } from "./results";
import { absWeek, overlaps, personBlocks, scheduleConflict } from "./schedule";
import { advanceWeeks } from "./turn";
import type { CastMember, GameState } from "./types";
import { castFromClient } from "./generate";
import { addWeeks, shootEnd } from "./schedule";

const catalog = fixtureCatalog();

function fresh(seed = 7): GameState {
  return createGame({ agencyName: "Paper Lantern", era: "today", seed, catalog });
}

describe("rng", () => {
  it("replays from the same seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [next(a), next(a), next(a)];
    const seqB = [next(b), next(b), next(b)];
    expect(seqA).toEqual(seqB);
    expect(seqA[0]).not.toBe(seqA[1]);
  });
});

describe("eligibility", () => {
  it("filters by era, age, and death", () => {
    const young = catalog.actors.find((a) => a.id === 9001)!;
    const dead = catalog.actors.find((a) => a.id === 9002)!;
    const working = catalog.actors.find((a) => a.id === 1)!;
    expect(isEligible(young, "today", 2026)).toBe(false);
    expect(isEligible(dead, "1990s", 1995)).toBe(false);
    expect(isEligible(working, "1990s", 1995)).toBe(true);
    expect(isEligible(working, "today", 2026)).toBe(true);
  });
});

describe("genre spread", () => {
  it("covers at least 15 genres and never lets one dominate a long run", () => {
    const state = fresh(3);
    const before = state.projects.length;
    for (let i = 0; i < 160; i++) {
      spawnFilm(state, catalog);
      if (i % 4 === 0) spawnSeries(state, catalog);
      state.date = addWeeks(state.date, 1);
    }
    const made = state.projects.slice(before).filter((p) => !p.cancelled);
    const counts: Record<string, number> = {};
    for (const project of made) {
      const genre = project.genres[0] ?? "Drama";
      counts[genre] = (counts[genre] ?? 0) + 1;
    }
    const total = made.length;
    expect(total).toBeGreaterThanOrEqual(180);
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(15);
    for (const genre of Object.keys(counts)) {
      expect(counts[genre]! / total).toBeLessThanOrEqual(0.2);
      expect(GENRES).toContain(genre);
    }
    expect(genreTotal(state)).toBeGreaterThan(200);
  });

  it("stays balanced across five simulated years", () => {
    let state = fresh(11);
    const signed = signClient(state, catalog, 4, { commission: 10, years: 5, exclusive: true, exitClause: true });
    expect(signed.ok).toBe(true);
    state = signed.state;
    for (const id of [5, 6, 8, 10, 12, 14]) {
      const next = signClient(state, catalog, id, { commission: 10, years: 4, exclusive: true, exitClause: true });
      if (next.ok) state = next.state;
    }
    const startProjects = new Set(state.projects.map((p) => p.id));
    const advanced = advanceWeeks(state, catalog, 260, { autoResolveEvents: true });
    state = advanced.state;
    const made = state.projects.filter((p) => !startProjects.has(p.id) && !p.historical && !p.cancelled);
    const counts: Record<string, number> = {};
    for (const project of made) counts[project.genres[0] ?? "Drama"] = (counts[project.genres[0] ?? "Drama"] ?? 0) + 1;
    const total = made.length;
    expect(total).toBeGreaterThan(100);
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(15);
    for (const count of Object.values(counts)) expect(count / total).toBeLessThanOrEqual(0.2);
    const outcomes = new Set(state.projects.filter((p) => p.kind === "series").flatMap((p) => p.seasons.map((s) => s.renewal)));
    expect(outcomes.has("renewed") || outcomes.has("renewed_short") || outcomes.has("cancelled") || outcomes.has("finale")).toBe(true);
  });
});

describe("schedule", () => {
  it("blocks a second prep or shoot and allows post-production", () => {
    let state = fresh(5);
    const signed = signClient(state, catalog, 7, { commission: 10, years: 3, exclusive: true, exitClause: true });
    state = signed.state;
    const client = state.clients.find((c) => c.personId === 7)!;
    const first = spawnFilm(state, catalog, {
      openFor: { client, role: "Lead", billing: 1 },
      windowFrom: state.date,
    });
    expect(first).toBeTruthy();
    state = pushManualOffer(state, first!, client.personId);
    const accepted = acceptOffer(state, "off_test", true);
    expect(accepted.ok).toBe(true);
    state = accepted.state;
    const booked = state.projects.find((p) => p.id === first!.id)!;
    const overlap = scheduleConflict(state, client.personId, booked.prepStart, shootEnd(booked));
    expect(overlap?.message).toMatch(/conflict/i);
    const duringPost = addWeeks(shootEnd(booked), 2);
    const postEnd = addWeeks(duringPost, 4);
    expect(absWeek(duringPost)).toBeGreaterThan(absWeek(shootEnd(booked)));
    expect(absWeek(postEnd)).toBeLessThan(absWeek(booked.release));
    expect(scheduleConflict(state, client.personId, duringPost, postEnd)).toBeNull();
  });

  it("never double-books anyone during a five-year run", () => {
    let state = fresh(9);
    const signed = signClient(state, catalog, 15, { commission: 10, years: 5, exclusive: true, exitClause: true });
    state = signed.state;
    state = advanceWeeks(state, catalog, 80, { autoResolveEvents: true }).state;
    const ids = new Set<number>();
    for (const project of state.projects) for (const member of project.cast) ids.add(member.personId);
    for (const id of ids) {
      const blocks = personBlocks(state, id).filter((b) => b.kind === "block");
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i]!;
          const b = blocks[j]!;
          if (a.projectId === b.projectId) continue;
          expect(overlaps(a.start, a.end, b.start, b.end)).toBe(false);
        }
      }
    }
  });
});

describe("negotiation", () => {
  it("kills a counter that clears the walk-away", () => {
    let state = fresh(4);
    state = signClient(state, catalog, 9, { commission: 10, years: 3, exclusive: true, exitClause: true }).state;
    const client = state.clients.find((c) => c.personId === 9)!;
    const project = spawnFilm(state, catalog, { openFor: { client, role: "Lead", billing: 1 } })!;
    state = pushManualOffer(state, project, client.personId);
    const offer = state.offers[0]!;
    const killed = counterOffer(state, offer.id, { fee: offer.walkAwayFee * 4 }, true);
    expect(killed.ok).toBe(false);
    expect(killed.message).toMatch(/walk-away/i);
    expect(killed.state.offers[0]?.status).toBe("killed");
  });
});

describe("verdicts", () => {
  it("writes a verdict and moves mood when a shoot wraps", () => {
    let state = fresh(6);
    state = signClient(state, catalog, 11, { commission: 10, years: 3, exclusive: true, exitClause: true }).state;
    const client = state.clients.find((c) => c.personId === 11)!;
    client.mood = "Thrilled";
    client.preferredGenres = ["Western"];
    client.traits.prestigeVsMoney = 90;
    client.nextPreference = "prestige";
    const member = castFromClient(client, "Lead", 1, 10_000, 0, "Ada Voss");
    const project = spawnFilm(state, catalog, { genre: "Superhero", forceTier: "tentpole", excludePeople: new Set([11]) })!;
    project.cast = [member];
    project.openRole = null;
    project.playerInvolved = true;
    project.scriptQuality = 30;
    project.directorAcclaim = 25;
    project.prestige = 20;
    project.prepStart = addWeeks(state.date, -2);
    project.shootStart = { ...state.date };
    project.shootWeeks = 1;
    project.release = addWeeks(state.date, 20);
    const next = advanceWeeks(state, catalog, 1, { autoResolveEvents: true }).state;
    const after = next.clients.find((c) => c.personId === 11)!;
    expect(after.verdicts.length).toBeGreaterThan(0);
    expect(after.verdicts[0]?.text.length).toBeGreaterThan(10);
    expect(after.mood).not.toBe("Thrilled");
  });
});

describe("series renewal", () => {
  it("renews hits, cancels collapses, and ends limited series", () => {
    const rng = makeRng(2);
    expect(
      decideRenewal({
        format: "limited",
        viewership: [2_000_000],
        critic: 80,
        budget: 10_000_000,
        strategy: 0,
        rng,
      }),
    ).toBe("finale");
    expect(
      decideRenewal({
        format: "ongoing_drama",
        viewership: [5_000_000, 4_800_000, 4_900_000],
        critic: 82,
        budget: 12_000_000,
        strategy: 0.15,
        rng: makeRng(3),
      }),
    ).toBe("renewed");
    expect(
      decideRenewal({
        format: "ongoing_drama",
        viewership: [800_000, 300_000, 180_000],
        critic: 32,
        budget: 80_000_000,
        strategy: -0.3,
        rng: makeRng(4),
      }),
    ).toBe("cancelled");
  });

  it("writes out expensive unhappy cast and keeps a happy lead", () => {
    const unhappy = fakeMember({ fee: 6_000_000, satisfaction: 1, role: "Recurring", billing: 4 });
    const happy = fakeMember({ fee: 200_000, satisfaction: 5, role: "Series Regular", billing: 1 });
    let dropped = 0;
    let kept = 0;
    for (let seed = 1; seed <= 24; seed++) {
      if (shouldWriteOut(makeRng(seed), unhappy, "ongoing_drama", "renewed")) dropped += 1;
      if (!shouldWriteOut(makeRng(seed + 100), happy, "ongoing_drama", "renewed")) kept += 1;
    }
    expect(dropped).toBeGreaterThan(10);
    expect(kept).toBeGreaterThan(16);
  });
});

function pushManualOffer(state: GameState, project: { id: string; studio: string; prestige: number; risk: number; scriptNote: string; prepStart: GameState["date"]; openRole: { character: string } | null }, personId: number): GameState {
  const next = structuredClone(state);
  next.offers.unshift({
    id: "off_test",
    projectId: project.id,
    personId,
    role: "Lead",
    character: project.openRole?.character ?? "Test",
    fee: 500_000,
    billing: 1,
    backend: 1,
    prestige: project.prestige,
    risk: project.risk,
    feeWhy: "Test quote.",
    prestigeWhy: "Test prestige.",
    riskWhy: "Test risk.",
    scriptNote: project.scriptNote,
    expires: addWeeks(next.date, 3),
    status: "pending",
    walkAwayFee: 700_000,
    walkAwayBackend: 3,
    minBilling: 1,
    dateFlexible: true,
    perkAvailable: true,
    perk: null,
    dateShiftWeeks: 0,
    studio: project.studio,
    created: { ...next.date },
  });
  return next;
}

function fakeMember(partial: Partial<CastMember>): CastMember {
  return {
    personId: 1,
    name: "Test",
    profilePath: null,
    gender: 1,
    role: partial.role ?? "Series Regular",
    character: "Sam",
    fee: partial.fee ?? 100_000,
    billing: partial.billing ?? 1,
    backend: 0,
    starPower: 40,
    talent: 50,
    buzz: 40,
    marketability: 40,
    genres: ["Drama"],
    traits: { ambition: 50, loyalty: 50, greed: 50, prestigeVsMoney: 50, riskAppetite: 50 },
    isPlayerClient: true,
    satisfaction: partial.satisfaction,
    writtenOut: false,
    active: true,
    awardTrack: "actress",
  };
}
