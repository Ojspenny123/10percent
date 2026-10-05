import { describe, expect, it } from "vitest";
import { signClient } from "./actions";
import { episodeQuote, migrateCareer } from "./career";
import { createGame } from "./create";
import { fixtureCatalog } from "./fixture";
import {
  loanWeek,
  payLoyalty,
  quotePackage,
  rollViral,
  runWaterfall,
  sleeperWeeks,
  upfrontFee,
} from "./money";
import { migrateBackend, attachCast, attachDirector, chooseConcept, chooseDistribution, developProduction, financeProduction, resolveInsolvency, scheduleTalentPay, serviceLoans, settlePayouts } from "./productions";
import { makeRng } from "./rng";
import { addWeeks } from "./schedule";
import { advanceWeeks } from "./turn";
import type { BudgetTier, FameTier, GameState } from "./types";

const catalog = fixtureCatalog();

function fresh(seed = 11): GameState {
  return createGame({ agencyName: "Paper Lantern", era: "today", seed, catalog });
}

describe("star pay", () => {
  const tiers: BudgetTier[] = ["micro-indie", "indie", "mid", "studio", "tentpole"];

  it("keeps working and known leads inside $50K to $1.5M", () => {
    for (const fame of ["Working", "Known"] as FameTier[]) {
      for (const tier of tiers) {
        const fee = upfrontFee({ fame, role: "Lead", tier, filmStar: 55, genre: "Drama" });
        expect(fee).toBeGreaterThanOrEqual(50_000);
        expect(fee).toBeLessThanOrEqual(1_500_000);
      }
    }
  });

  it("pays A-list and Icon commercial leads in the multi-millions", () => {
    for (const tier of ["mid", "studio", "tentpole"] as BudgetTier[]) {
      const fee = upfrontFee({ fame: "A-list", role: "Lead", tier, filmStar: 80, genre: "Action" });
      expect(fee).toBeGreaterThanOrEqual(5_000_000);
      expect(fee).toBeLessThanOrEqual(25_000_000);
    }
    for (const tier of ["studio", "tentpole"] as BudgetTier[]) {
      const fee = upfrontFee({ fame: "Icon", role: "Lead", tier, filmStar: 92, genre: "Superhero" });
      expect(fee).toBeGreaterThanOrEqual(20_000_000);
    }
    const indie = upfrontFee({ fame: "A-list", role: "Lead", tier: "indie", filmStar: 80, genre: "Drama" });
    expect(indie).toBeLessThan(5_000_000);
    const tentpole = quotePackage({ fame: "Icon", role: "Lead", tier: "tentpole", filmStar: 90, genre: "Action" });
    expect(tentpole.style).toBe("first_dollar");
    expect(tentpole.high).toBeGreaterThan(tentpole.low);
    expect(tentpole.low).toBe(tentpole.fee);
  });

  it("quotes a top film star in the seven figures per episode", () => {
    const quote = episodeQuote({
      fame: "Icon",
      role: "Lead",
      medium: "Film",
      filmStar: 90,
      tvStar: 30,
      season: 1,
      episodes: 8,
      format: "limited",
    });
    expect(quote.episodeFee).toBeGreaterThanOrEqual(1_000_000);
  });
});

describe("waterfall", () => {
  it("splits gross, exhibitor, distributor, investors, and backend", () => {
    const result = runWaterfall({
      domestic: 1000,
      international: 1000,
      streaming: 0,
      budget: 400,
      marketing: 100,
      distributorRate: 0.2,
      investorShare: 0.5,
      loanBalance: 0,
      talent: [{
        personId: 1,
        name: "A",
        upfront: 50,
        style: "box_office",
        points: 10,
        bonuses: [],
        isPlayerClient: true,
        commissionRate: 10,
      }],
    });
    expect(result.exhibitor).toBe(900);
    expect(result.distributorFee).toBe(220);
    expect(result.talent[0]!.backend).toBe(88);
    expect(result.investorTake).toBe(146);
    expect(result.agencyProfit).toBe(146);
    expect(result.lines.some((line) => line.label === "Agency profit")).toBe(true);
  });

  it("pays backend commission on the due week, not at release", () => {
    const state = fresh(4);
    const project = state.projects.find((row) => row.kind === "film" && row.cast.length > 0)!;
    project.kind = "film";
    project.domesticTotal = 40_000_000;
    project.internationalTotal = 20_000_000;
    project.budget = 10_000_000;
    project.marketing = 4_000_000;
    project.budgetTier = "mid";
    project.cast = [{
      ...project.cast[0]!,
      personId: 4,
      name: "Actor 4",
      isPlayerClient: true,
      backend: 5,
      backendStyle: "box_office",
      bonuses: [],
      fee: 2_000_000,
    }];
    const before = state.agency.cash;
    scheduleTalentPay(state, project);
    expect(state.agency.cash).toBe(before);
    const due = state.payouts!.filter((row) => row.kind === "backend");
    expect(due.length).toBeGreaterThan(0);
    expect(due.every((row) => !row.paid)).toBe(true);
    state.date = { ...due[0]!.due };
    settlePayouts(state);
    const paid = state.payouts!.filter((row) => row.paid && row.kind === "backend");
    expect(paid.length).toBeGreaterThan(0);
    expect(state.agency.cash).toBeGreaterThan(before);
    expect(state.ledger.some((row) => row.bucket === "backend")).toBe(true);
  });
});

describe("weekly backend", () => {
  function filmWithBackend(gross: number, style: "box_office" | "net" | "first_dollar" = "box_office") {
    const state = fresh(4);
    const project = state.projects.find((row) => row.kind === "film" && row.cast.length > 0)!;
    const weights = [0.3, 0.22, 0.15, 0.1, 0.08, 0.06, 0.05, 0.04];
    const domestic = gross * 0.45;
    project.weeklyGross = weights.map((weight) => Math.round(domestic * weight));
    project.domesticTotal = project.weeklyGross.reduce((sum, n) => sum + n, 0);
    project.internationalTotal = gross * 0.55;
    project.streamingTotal = 0;
    project.budget = 20_000_000;
    project.marketing = 8_000_000;
    project.budgetTier = "mid";
    project.cast = [{ ...project.cast[0]!, personId: 4, name: "Actor 4", isPlayerClient: true, backend: 5, backendStyle: style, bonuses: [], fee: 2_000_000 }];
    scheduleTalentPay(state, project);
    const backend = state.payouts!.filter((row) => row.kind === "backend");
    return { state, project, backend };
  }

  it("pays box-office points on rentals every week, even before the film is in profit", () => {
    const { state, backend } = filmWithBackend(28_000_000 * 1.2);
    expect(backend.length).toBeGreaterThanOrEqual(6);
    const dues = backend.map((row) => row.due.year * 52 + row.due.week);
    expect(new Set(dues).size).toBe(dues.length);
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
    expect(backend.every((row) => !row.paid)).toBe(true);
    const before = state.agency.cash;
    state.date = { ...backend[0]!.due };
    settlePayouts(state);
    expect(state.agency.cash).toBeGreaterThan(before);
    expect(state.payouts!.filter((row) => row.kind === "backend" && row.paid)).toHaveLength(1);
  });

  it("adds up to what the waterfall says the client earned", () => {
    const { state, project, backend } = filmWithBackend(28_000_000 * 3);
    const total = backend.reduce((sum, row) => sum + row.amount, 0);
    const result = runWaterfall({
      domestic: project.domesticTotal ?? 0,
      international: project.internationalTotal ?? 0,
      streaming: 0,
      budget: project.budget,
      marketing: project.marketing,
      distributorRate: 0.22,
      investorShare: 0,
      loanBalance: 0,
      talent: [{ personId: 4, name: "Actor 4", upfront: 2_000_000, style: "box_office", points: 5, bonuses: [], isPlayerClient: true, commissionRate: 10 }],
    });
    expect(Math.abs(total - result.talent[0]!.backend)).toBeLessThanOrEqual(2);
    expect(state.inbox.some((item) => item.title.startsWith("Backend on"))).toBe(true);
  });

  it("starts net points only once the film is in profit", () => {
    const boxOffice = filmWithBackend(28_000_000 * 3, "box_office");
    const net = filmWithBackend(28_000_000 * 3, "net");
    expect(net.backend.length).toBeGreaterThan(0);
    const week = (row: { due: { year: number; week: number } }) => row.due.year * 52 + row.due.week;
    expect(week(net.backend[0]!)).toBeGreaterThan(week(boxOffice.backend[0]!));
  });

  it("pays nothing, and says why, when net points never reach profit", () => {
    const { state, project, backend } = filmWithBackend(28_000_000 * 1.2, "net");
    expect(backend).toHaveLength(0);
    const note = state.inbox.find((item) => item.id === `in_backend_${project.id}_4`);
    expect(note?.title).toContain("No backend");
    expect(note?.body).toContain("short");
  });
});

describe("backend migration for existing saves", () => {
  function oldSave(weeksAgo: number) {
    const state = fresh(4);
    delete state.backendModel;
    const project = state.projects.find((row) => row.kind === "film" && row.cast.length > 0)!;
    const weights = [0.3, 0.22, 0.15, 0.1, 0.08, 0.06, 0.05, 0.04];
    const gross = 28_000_000 * 3;
    project.historical = false;
    project.cancelled = false;
    project.release = addWeeks(state.date, -weeksAgo);
    project.weeklyGross = weights.map((weight) => Math.round(gross * 0.45 * weight));
    project.domesticTotal = project.weeklyGross.reduce((sum, n) => sum + n, 0);
    project.internationalTotal = gross * 0.55;
    project.totalGross = gross;
    project.streamingTotal = 0;
    project.budget = 20_000_000;
    project.marketing = 8_000_000;
    project.budgetTier = "mid";
    project.cast = [{ ...project.cast[0]!, personId: 4, name: "Actor 4", isPlayerClient: true, backend: 5, backendStyle: "box_office", bonuses: [], fee: 2_000_000 }];
    return { state, project };
  }
  const expectedBackend = (project: { domesticTotal?: number; internationalTotal?: number; budget: number; marketing: number }) =>
    runWaterfall({
      domestic: project.domesticTotal ?? 0,
      international: project.internationalTotal ?? 0,
      streaming: 0,
      budget: project.budget,
      marketing: project.marketing,
      distributorRate: 0.22,
      investorShare: 0,
      loanBalance: 0,
      talent: [{ personId: 4, name: "Actor 4", upfront: 2_000_000, style: "box_office", points: 5, bonuses: [], isPlayerClient: true, commissionRate: 10 }],
    }).talent[0]!.backend;
  const talentTotal = (state: ReturnType<typeof fresh>, projectId: string) =>
    state.payouts!.filter((row) => row.projectId === projectId && row.kind === "backend").reduce((sum, row) => sum + row.amount, 0);

  it("replaces the old lump-sum schedule and keeps what was already paid", () => {
    const { state, project } = oldSave(30);
    state.payouts = [
      { id: "old1", projectId: project.id, personId: 4, name: "Actor 4", kind: "backend", amount: 100_000, commissionRate: 10, due: addWeeks(project.release, 2), paid: true },
      { id: "old2", projectId: project.id, personId: 4, name: "Actor 4", kind: "backend", amount: 100_000, commissionRate: 10, due: addWeeks(project.release, 8), paid: true },
      { id: "old3", projectId: project.id, personId: 4, name: "Actor 4", kind: "backend", amount: 100_000, commissionRate: 10, due: addWeeks(state.date, 3), paid: false },
    ];
    migrateBackend(state);
    expect(state.backendModel).toBe(2);
    expect(state.payouts!.some((row) => row.id === "old3")).toBe(false);
    expect(state.payouts!.filter((row) => row.id === "old1" || row.id === "old2")).toHaveLength(2);
    const total = talentTotal(state, project.id);
    expect(Math.abs(total - expectedBackend(project))).toBeLessThanOrEqual(3);
    const unpaid = state.payouts!.filter((row) => row.kind === "backend" && !row.paid);
    expect(unpaid.every((row) => row.amount > 0)).toBe(true);
    expect(state.inbox.some((item) => item.title.startsWith("Backend recalculated"))).toBe(true);
  });

  it("pays the weeks already gone as one catch-up, then the rest weekly", () => {
    const { state, project } = oldSave(4);
    state.payouts = [];
    migrateBackend(state);
    const rows = state.payouts!.filter((row) => row.kind === "backend");
    const today = state.date.year * 52 + state.date.week;
    const due = (row: (typeof rows)[number]) => row.due.year * 52 + row.due.week;
    expect(rows.filter((row) => due(row) <= today)).toHaveLength(1);
    expect(rows.filter((row) => due(row) > today).length).toBeGreaterThan(2);
    const before = state.agency.cash;
    settlePayouts(state);
    expect(state.agency.cash).toBeGreaterThan(before);
    expect(talentTotal(state, project.id)).toBeGreaterThan(0);
  });

  it("does nothing the second time", () => {
    const { state } = oldSave(10);
    state.payouts = [];
    migrateBackend(state);
    const snapshot = JSON.stringify(state.payouts);
    const notes = state.inbox.length;
    migrateBackend(state);
    expect(JSON.stringify(state.payouts)).toBe(snapshot);
    expect(state.inbox.length).toBe(notes);
  });

  it("leaves films older than two years and unreleased films alone", () => {
    const old = oldSave(130);
    old.state.payouts = [];
    migrateBackend(old.state);
    expect(old.state.payouts).toHaveLength(0);
    const future = oldSave(-6);
    future.state.payouts = [];
    migrateBackend(future.state);
    expect(future.state.payouts).toHaveLength(0);
  });

  it("does not claw back when the old rules paid more", () => {
    const { state, project } = oldSave(40);
    state.payouts = [{ id: "big", projectId: project.id, personId: 4, name: "Actor 4", kind: "backend", amount: 9_000_000, commissionRate: 10, due: addWeeks(project.release, 2), paid: true }];
    migrateBackend(state);
    expect(state.payouts!.filter((row) => row.kind === "backend" && !row.paid)).toHaveLength(0);
    expect(state.payouts!.find((row) => row.id === "big")?.amount).toBe(9_000_000);
  });

  it("counts the lump sum older saves booked at release", () => {
    const { state, project } = oldSave(40);
    state.payouts = [];
    state.ledger.unshift({ date: addWeeks(project.release, 0), label: `Backend points · Actor 4 · ${project.title}`, amount: 150_000, balance: state.agency.cash, bucket: "bonus" });
    migrateBackend(state);
    const total = talentTotal(state, project.id);
    // 150,000 of commission at 10% is 1,500,000 of backend already paid, so only the rest is owed.
    expect(Math.abs(total + 1_500_000 - expectedBackend(project))).toBeLessThanOrEqual(3);
  });
});

describe("loans and insolvency", () => {
  it("charges interest and principal on an emergency loan", () => {
    const state = fresh(5);
    state.loans = [{
      id: "loan_1",
      productionId: null,
      label: "Emergency loan",
      principal: 520_000,
      balance: 520_000,
      annualRate: 0.12,
      emergency: true,
    }];
    const before = state.agency.cash;
    const week = loanWeek({ balance: 520_000, principal: 520_000, annualRate: 0.12 });
    serviceLoans(state);
    expect(week.interest).toBe(1200);
    expect(week.principalPay).toBe(10_000);
    expect(state.agency.cash).toBe(before - week.payment);
    expect(state.loans![0]!.balance).toBe(week.balance);
  });

  it("writes an emergency loan, then closes the agency if the hole remains", () => {
    const state = fresh(6);
    state.agency.cash = -50_000;
    state.insolventWeeks = 3;
    resolveInsolvency(state);
    expect(state.agency.cash).toBeGreaterThan(0);
    expect(state.loans!.some((loan) => loan.emergency)).toBe(true);
    expect(state.gameOver).toBe(false);
    state.agency.cash = -5_000;
    state.loans = [
      { id: "a", productionId: null, label: "Emergency loan", principal: 1, balance: 1, annualRate: 0.28, emergency: true },
      { id: "b", productionId: null, label: "Emergency loan", principal: 1, balance: 1, annualRate: 0.28, emergency: true },
    ];
    state.insolventWeeks = 9;
    resolveInsolvency(state);
    expect(state.gameOver).toBe(true);
  });
});

describe("sleepers and loyalty", () => {
  it("makes viral breakouts rare and lets the gross climb", () => {
    let hits = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const roll = rollViral(makeRng(seed), { tier: "micro-indie", genre: "Horror", hook: 90, directorAcclaim: 80, audience: 86 });
      if (roll.hit) {
        hits += 1;
        expect(roll.multiple).toBeGreaterThanOrEqual(20);
        expect(roll.multiple).toBeLessThanOrEqual(100);
      }
    }
    expect(hits).toBeGreaterThan(8);
    expect(hits).toBeLessThan(80);
    const quiet = rollViral(makeRng(2), { tier: "tentpole", genre: "Horror", hook: 99, directorAcclaim: 90, audience: 90 });
    expect(quiet.hit).toBe(false);
    const curve = sleeperWeeks(100_000, 40);
    expect(curve.weekly[1]!).toBeGreaterThan(curve.weekly[0]!);
    expect(curve.weekly[2]!).toBeGreaterThan(curve.weekly[1]!);
    expect(curve.weekly[3]!).toBeGreaterThan(curve.weekly[2]!);
    expect(curve.total).toBeGreaterThan(100_000 * 20);
  });

  it("drops loyalty when the agency underpays and raises it when the offer is rich", () => {
    expect(payLoyalty(1_000_000, 400_000).delta).toBeLessThan(0);
    expect(payLoyalty(1_000_000, 1_500_000).delta).toBeGreaterThan(0);
    let state = fresh(8);
    state.agency.cash = 5_000_000;
    const opened = developProduction(state, "Horror", "micro-indie", 8, 4);
    expect(opened.ok).toBe(true);
    state = opened.state;
    const production = state.productions![0]!;
    state = chooseConcept(state, production.id, 0).state;
    state = attachDirector(state, catalog, production.id, catalog.directors[0]!.id).state;
    const personId = catalog.actors.find((actor) => !state.clients.some((client) => client.personId === actor.id))!.id;
    const signed = signClient(state, catalog, personId, { commission: 10, years: 3, exclusive: true, exitClause: true });
    expect(signed.ok).toBe(true);
    state = signed.state;
    const client = state.clients.find((row) => row.personId === personId)!;
    const before = client.loyalty;
    const market = upfrontFee({ fame: client.fame, role: "Lead", tier: "micro-indie", filmStar: client.filmStar, genre: "Horror" });
    const low = attachCast(state, catalog, production.id, personId, "Lead", Math.round(market * 0.5));
    expect(low.ok).toBe(true);
    expect(low.state.clients.find((row) => row.personId === personId)!.loyalty).toBeLessThan(before);
  });
});

describe("old saves and a financed picture", () => {
  it("backfills production lists", () => {
    const state = fresh(2);
    state.productions = undefined;
    state.loans = undefined;
    state.payouts = undefined;
    migrateCareer(state);
    expect(state.productions).toEqual([]);
    expect(state.loans).toEqual([]);
    expect(state.payouts).toEqual([]);
    expect(state.gameOver).toBe(false);
  });

  it("finances a micro film and releases it with a waterfall", () => {
    let state = fresh(12);
    state.agency.cash = 8_000_000;
    state = developProduction(state, "Horror", "micro-indie", 6, 4).state;
    const id = state.productions![0]!.id;
    state = chooseConcept(state, id, 0).state;
    state = attachDirector(state, catalog, id, catalog.directors[1]!.id).state;
    const personId = catalog.actors.find((actor) => !state.clients.some((client) => client.personId === actor.id))!.id;
    const signed = signClient(state, catalog, personId, { commission: 10, years: 4, exclusive: true, exitClause: true });
    expect(signed.ok).toBe(true);
    state = signed.state;
    const client = state.clients.find((row) => row.personId === personId)!;
    const market = upfrontFee({ fame: client.fame, role: "Lead", tier: "micro-indie", filmStar: client.filmStar, genre: "Horror" });
    const attached = attachCast(state, catalog, id, personId, "Lead", market);
    expect(attached.ok).toBe(true);
    state = attached.state;
    const financed = financeProduction(state, id, "cash");
    expect(financed.ok).toBe(true);
    state = financed.state;
    const distributed = chooseDistribution(state, id, "theatrical");
    expect(distributed.ok).toBe(true);
    state = distributed.state;
    const projectId = state.productions!.find((row) => row.id === id)!.projectId!;
    for (let week = 0; week < 40 && !state.projects.find((row) => row.id === projectId)?.ended; week++) {
      state = advanceWeeks(state, catalog, 1, { autoResolveEvents: true }).state;
    }
    const project = state.projects.find((row) => row.id === projectId)!;
    const production = state.productions!.find((row) => row.id === id)!;
    expect(project.ended).toBe(true);
    expect(production.stage).toBe("released");
    expect(production.waterfall?.lines.length).toBeGreaterThan(3);
    expect(production.waterfall?.lines.some((line) => line.label === "Agency profit")).toBe(true);
  }, 30_000);
});
