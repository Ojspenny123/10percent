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
import { attachCast, attachDirector, chooseConcept, chooseDistribution, developProduction, financeProduction, resolveInsolvency, scheduleTalentPay, serviceLoans, settlePayouts } from "./productions";
import { makeRng } from "./rng";
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
    expect(result.investorTake).toBe(190);
    expect(result.talent[0]!.backend).toBe(190);
    expect(result.agencyProfit).toBe(0);
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
