import { describe, expect, it } from "vitest";
import { acceptOffer, actorFit, signClient } from "./actions";
import {
  blocksOverlap,
  buildBlocks,
  bumpedFee,
  cancellationBuyout,
  episodeQuote,
  longOrderRefusal,
  migrateCareer,
  pickDeal,
  profileFromCredits,
  rollPilotOutcome,
} from "./career";
import { createGame } from "./create";
import { considerFranchise, payShootCommissions, resolvePilotDecisions } from "./deals";
import { fixtureCatalog } from "./fixture";
import { makeRng } from "./rng";
import { absWeek, addWeeks, overlaps, personBlocks } from "./schedule";
import { advanceWeeks } from "./turn";
import type { GameState, Season } from "./types";

const catalog = fixtureCatalog();

function fresh(seed = 7): GameState {
  return createGame({ agencyName: "Paper Lantern", era: "today", seed, catalog });
}

function season(episodes = 10, shootWeeks = 12): Season {
  return {
    number: 1,
    episodes,
    episodeMinutes: 44,
    schedule: "weekly",
    prepStart: { year: 2026, week: 10 },
    shootStart: { year: 2026, week: 14 },
    shootWeeks,
    premiere: { year: 2026, week: 30 },
    episodesAired: 0,
    viewership: [],
    renewal: "pending",
    reviews: [],
  };
}

describe("medium from credits", () => {
  const credit = (title: string, mediaType: "movie" | "tv", rating: number) => ({ title, year: "2022", character: "Lead", rating, mediaType });
  it("leans film, TV, or both from the credit mix", () => {
    const film = profileFromCredits([credit("A", "movie", 7.4), credit("B", "movie", 8), credit("C", "movie", 6.8), credit("D", "movie", 7.1)], 40, 4, 2026);
    const tv = profileFromCredits([credit("E", "tv", 8.1), credit("F", "tv", 7.6), credit("G", "tv", 8.4), credit("H", "tv", 7.2)], 36, 5, 2026);
    const both = profileFromCredits([credit("I", "movie", 7.5), credit("J", "movie", 7.8), credit("K", "tv", 8), credit("L", "tv", 7.4)], 44, 6, 2026);
    expect(film.medium).toBe("Film");
    expect(tv.medium).toBe("TV");
    expect(both.medium).toBe("Both");
    expect(film.filmStar).toBeGreaterThan(film.tvStar + 8);
    expect(tv.tvStar).toBeGreaterThan(tv.filmStar + 8);
    expect(film.filmStar).not.toBe(tv.filmStar);
    expect(film.filmStar).toBeLessThan(99);
  });
});

describe("series money and blocks", () => {
  it("pays a film star more per episode than a TV peer and refuses a long order", () => {
    const film = episodeQuote({ fame: "A-list", role: "Lead", medium: "Film", filmStar: 88, tvStar: 40, season: 1, episodes: 8, format: "ongoing_drama" });
    const tv = episodeQuote({ fame: "A-list", role: "Lead", medium: "TV", filmStar: 40, tvStar: 88, season: 1, episodes: 8, format: "ongoing_drama" });
    expect(film.episodeFee).toBeGreaterThan(tv.episodeFee * 1.4);
    expect(film.total).toBe(film.episodeFee * film.episodes);
    const later = episodeQuote({ fame: "Known", role: "Series Regular", medium: "TV", filmStar: 30, tvStar: 60, season: 4, episodes: 10, format: "sitcom" });
    const first = episodeQuote({ fame: "Known", role: "Series Regular", medium: "TV", filmStar: 30, tvStar: 60, season: 1, episodes: 10, format: "sitcom" });
    expect(later.episodeFee).toBeGreaterThan(first.episodeFee);
    expect(longOrderRefusal({ medium: "Film", filmStar: 80 } as never, "Lead", 22)).toMatch(/will not take/i);
  });

  it("books leads for the whole window and keeps guest and recurring blocks from overlapping", () => {
    const window = season(10, 14);
    const lead = buildBlocks("Lead", window, makeRng(3));
    expect(lead).toHaveLength(1);
    expect(lead[0]!.start).toEqual(window.prepStart);
    expect(lead[0]!.weeks).toBeGreaterThan(window.shootWeeks);
    const guest = buildBlocks("Guest Star", window, makeRng(4));
    expect(guest[0]!.episodes).toBeLessThanOrEqual(2);
    expect(guest[0]!.weeks).toBeLessThan(window.shootWeeks);
    for (let seed = 1; seed <= 20; seed++) {
      const recurring = buildBlocks("Recurring", window, makeRng(seed));
      expect(blocksOverlap(recurring)).toBe(false);
      const span = recurring.reduce((sum, block) => sum + block.weeks, 0);
      expect(span).toBeLessThan(window.shootWeeks + 4);
    }
  });

  it("bumps multi-season fees and pays a guarantee buyout", () => {
    expect(bumpedFee(100_000, 0.1, 2)).toBe(121_000);
    const guaranteed = pickDeal(makeRng(2), "Series Regular", "ongoing_drama");
    expect(["single", "guaranteed", "option"]).toContain(guaranteed.style);
    expect(pickDeal(makeRng(1), "Guest Star", "ongoing_drama").style).toBe("single");
    expect(pickDeal(makeRng(1), "Lead", "limited").seasons).toBe(1);
    const buyout = cancellationBuyout({ style: "guaranteed", seasons: 5, seasonsServed: 2, annualBump: 0.08, episodeFee: 100_000, role: "Lead" }, 10);
    expect(buyout).toBe(Math.round(100_000 * 10 * 0.4 * 3));
    expect(cancellationBuyout({ style: "option", seasons: 5, seasonsServed: 1, annualBump: 0.05, episodeFee: 100_000, role: "Lead" }, 10)).toBe(0);
  });

  it("commissions series work per episode across the shoot", () => {
    const state = fresh(8);
    const signed = signClient(state, catalog, 6, { commission: 10, years: 3, exclusive: true, exitClause: true });
    const next = signed.state;
    const client = next.clients.find((row) => row.personId === 6)!;
    next.projects.push({
      id: "prj_pay",
      kind: "series",
      title: "Night Desk",
      logline: "",
      genres: ["Drama"],
      budgetTier: "mid",
      budget: 1_000_000,
      marketing: 0,
      directorId: null,
      directorName: "Director",
      directorPull: 40,
      directorAcclaim: 50,
      studio: "Network",
      prepStart: { ...next.date },
      shootStart: { ...next.date },
      shootWeeks: 4,
      postWeeks: 2,
      release: addWeeks(next.date, 10),
      format: "ongoing_drama",
      network: "Network",
      episodeMinutes: 44,
      seasons: [{
        ...season(4, 4),
        prepStart: { ...next.date },
        shootStart: { ...next.date },
      }],
      phase: "shooting",
      scriptQuality: 60,
      scriptNote: "",
      prestige: 50,
      risk: 40,
      cast: [{
        personId: client.personId,
        name: client.name,
        profilePath: null,
        gender: client.gender,
        role: "Series Regular",
        character: "Alex",
        fee: 400_000,
        billing: 1,
        backend: 0,
        starPower: 40,
        talent: 40,
        buzz: 40,
        marketability: 40,
        genres: [],
        traits: client.traits,
        isPlayerClient: true,
        writtenOut: false,
        active: true,
        awardTrack: "actor",
        episodeFee: 100_000,
        episodes: 4,
        blocks: [{ start: { ...next.date }, weeks: 4, episodes: 4 }],
        episodesPaid: 0,
      }],
      openRole: null,
      reviews: [],
      weeklyGross: [],
      sequelNumber: 1,
      historical: false,
      playerInvolved: true,
      fycSpend: 0,
      festival: null,
      commissionsPaid: [],
      ended: false,
      cancelled: false,
      origin: "straight",
    });
    const before = next.agency.cash;
    payShootCommissions(next);
    expect(next.agency.cash - before).toBe(Math.round(100_000 * (client.contract!.commission / 100)));
    expect(next.ledger[0]!.bucket).toBe("series");
    expect(next.projects[next.projects.length - 1]!.cast[0]!.episodesPaid).toBeGreaterThan(0);
  });
});

describe("pilots and franchises", () => {
  it("picks up, passes, and recasts pilots", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) outcomes.add(rollPilotOutcome(makeRng(seed)));
    expect(outcomes.has("picked_up")).toBe(true);
    expect(outcomes.has("passed")).toBe(true);
    expect(outcomes.has("retooled")).toBe(true);

    const state = fresh(12);
    state.projects.push({
      ...state.projects[0]!,
      id: "prj_pilot",
      kind: "series",
      title: "Pilot Hour",
      cancelled: false,
      ended: false,
      origin: "pilot",
      pilot: {
        status: "awaiting",
        decision: { ...state.date },
        optionSeasons: 3,
        optionRole: "Series Regular",
        optionFee: 50_000,
        optionEpisodes: 8,
      },
      seasons: [{ ...season(), prepStart: addWeeks(state.date, 2), shootStart: addWeeks(state.date, 4), premiere: addWeeks(state.date, 20) }],
      cast: state.projects[0]!.cast.slice(0, 1).map((member) => ({ ...member, active: true, writtenOut: false, role: "Series Regular" as const })),
    });
    resolvePilotDecisions(state);
    const pilot = state.projects.find((project) => project.id === "prj_pilot")!;
    expect(["picked_up", "passed", "retooled"]).toContain(pilot.pilot?.status);
    if (pilot.pilot?.status === "picked_up") {
      expect(pilot.cast.some((member) => member.blocks && member.blocks.length > 0) || pilot.cast.every((member) => !member.active)).toBe(true);
    }
    if (pilot.pilot?.status === "passed") expect(pilot.cancelled).toBe(true);
  });

  it("locks a franchise after a tentpole hit", () => {
    let locked = false;
    for (let n = 0; n < 8 && !locked; n++) {
      const state = fresh(20 + n);
      const signed = signClient(state, catalog, 4, { commission: 10, years: 4, exclusive: true, exitClause: true });
      const client = signed.state.clients.find((row) => row.personId === 4)!;
      client.fame = "A-list";
      client.filmStar = 86;
      const project = signed.state.projects.find((row) => row.kind === "film")!;
      project.budgetTier = "tentpole";
      project.profitLabel = "blockbuster";
      project.playerInvolved = true;
      project.totalGross = project.budget * 4;
      project.cast = [{
        personId: client.personId,
        name: client.name,
        profilePath: null,
        gender: 2,
        role: "Lead",
        character: "Lead",
        fee: 8_000_000,
        billing: 1,
        backend: 5,
        starPower: 80,
        talent: 70,
        buzz: 70,
        marketability: 70,
        genres: [],
        traits: client.traits,
        isPlayerClient: true,
        writtenOut: false,
        active: true,
        awardTrack: "actor",
      }];
      considerFranchise(signed.state, project);
      locked = client.franchises.length > 0;
      if (!locked) continue;
      expect(client.franchises[0]!.films.length).toBeGreaterThanOrEqual(2);
      expect(client.franchises[0]!.films[1]!.fee).toBeGreaterThan(client.franchises[0]!.films[0]!.fee);
      const holds = signed.state.holds.filter((hold) => hold.kind === "franchise" && hold.personId === client.personId);
      expect(holds.length).toBe(client.franchises[0]!.films.length);
      for (let i = 0; i < holds.length; i++) {
        for (let j = i + 1; j < holds.length; j++) {
          expect(overlaps(absWeek(holds[i]!.start), absWeek(holds[i]!.end), absWeek(holds[j]!.start), absWeek(holds[j]!.end))).toBe(false);
        }
      }
    }
    expect(locked).toBe(true);
  });
});

describe("saves", () => {
  it("moves the weekly stamp on a turn and leaves it alone when someone signs", () => {
    const state = fresh(3);
    const stamped = { ...state.lastAutosave! };
    const signed = signClient(state, catalog, 4, { commission: 10, years: 3, exclusive: true, exitClause: true });
    expect(signed.state.lastAutosave).toEqual(stamped);
    const advanced = advanceWeeks(signed.state, catalog, 2, { autoResolveEvents: true });
    expect(advanced.state.lastAutosave).toEqual(advanced.state.date);
    expect(advanced.state.lastAutosave).not.toEqual(stamped);
  });

  it("backfills medium, buckets, and series years on an old save", () => {
    const state = fresh(2);
    const client = state.clients[0]!;
    delete (client as { medium?: string }).medium;
    (client as { filmStar?: number }).filmStar = undefined;
    state.ledger.push({ date: { ...state.date }, label: "Commission · old film", amount: 1000, balance: 1 });
    state.projects.push({
      ...state.projects[0]!,
      id: "prj_old_series",
      kind: "series",
      origin: undefined,
      format: "ongoing_drama",
      seasons: [{ ...season(), producedYear: undefined, releasedYear: undefined }],
      cast: [{
        ...state.projects[0]!.cast[0]!,
        role: "Series Regular",
        fee: 500_000,
        episodeFee: undefined,
        episodes: undefined,
      }],
    });
    migrateCareer(state);
    expect(client.medium).toMatch(/Film|TV|Both/);
    expect(client.filmStar).toBeGreaterThan(0);
    expect(client.franchises).toEqual([]);
    expect(state.ledger.at(-1)?.bucket).toBe("film");
    const series = state.projects.find((project) => project.id === "prj_old_series")!;
    expect(series.origin).toBe("straight");
    expect(series.seasons[0]!.producedYear).toBe(series.seasons[0]!.shootStart.year);
    expect(series.cast[0]!.episodeFee).toBeGreaterThan(0);
    expect(state.lastAutosave?.year).toBe(state.date.year);
  });
});

describe("five simulated years", () => {
  it("mixes media, seasons, pilots, and fees", () => {
    let state = fresh(21);
    for (const id of [4, 5, 6, 8, 11, 16]) {
      const signed = signClient(state, catalog, id, { commission: 10, years: 5, exclusive: true, exitClause: true });
      if (signed.ok) state = signed.state;
    }
    const star = state.clients.find((client) => client.personId === 4)!;
    star.fame = "Icon";
    star.filmStar = 90;
    star.stats.starPower = 90;
    for (let week = 0; week < 270; week++) {
      for (const offer of [...state.offers]) {
        if (offer.status !== "pending") continue;
        const project = state.projects.find((item) => item.id === offer.projectId);
        const client = state.clients.find((item) => item.personId === offer.personId && item.agency === "player");
        if (!project || !client) continue;
        const fit = actorFit(client, project, offer.fee, offer.billing, offer.role);
        if (fit.score < 36 && !offer.renewal) continue;
        const result = acceptOffer(state, offer.id, true);
        if (result.ok) state = result.state;
      }
      state = advanceWeeks(state, catalog, 1, { autoResolveEvents: true }).state;
    }
    const roster = state.clients.filter((client) => [4, 5, 6, 8, 11, 16].includes(client.personId));
    const media = new Set(roster.map((client) => client.medium));
    expect(media.has("Film")).toBe(true);
    expect(media.has("TV")).toBe(true);
    expect(media.has("Both")).toBe(true);
    const series = state.projects.filter((project) => project.kind === "series");
    expect(series.some((project) => project.seasons.length >= 2)).toBe(true);
    const pilots = series.filter((project) => project.pilot);
    expect(pilots.length).toBeGreaterThan(1);
    const pilotStatuses = new Set(pilots.map((project) => project.pilot?.status));
    expect(pilotStatuses.has("picked_up")).toBe(true);
    expect(pilotStatuses.has("passed") || pilotStatuses.has("retooled")).toBe(true);
    expect(roster.some((client) => client.franchises.length > 0) || state.holds.some((hold) => hold.kind === "franchise")).toBe(true);
    const fees = state.offers.filter((offer) => offer.pay === "episode" && offer.episodeFee).map((offer) => offer.episodeFee!);
    if (fees.length > 1) {
      expect(Math.max(...fees)).toBeGreaterThan(Math.min(...fees) * 2);
    }
    const blocksOk = state.clients.filter((client) => client.agency === "player").every((client) => {
      const blocks = personBlocks(state, client.personId);
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          if (blocks[i]!.projectId === blocks[j]!.projectId) continue;
          if (overlaps(blocks[i]!.start, blocks[i]!.end, blocks[j]!.start, blocks[j]!.end)) return false;
        }
      }
      return true;
    });
    expect(blocksOk).toBe(true);
  }, 30_000);
});
