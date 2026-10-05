import { describe, expect, it } from "vitest";
import { applyEventChoice, signClient } from "./actions";
import { migrateCareer } from "./career";
import { createGame } from "./create";
import { fixtureCatalog } from "./fixture";
import { keepBigOffer } from "./places";
import { tickRivals } from "./rivals";
import { addWeeks, scheduleConflict } from "./schedule";
import { advanceWeeks } from "./turn";
import { agentHandles, agentPlan, assignAgent, buyUpgrade, hireAgent, hireExecutive, hirePublicist, informationalUnread, launchCampaign, markInformationalRead, openDecisions, openSatellite, projectedBonus, relocateAgency, setAgent, setExecLimits, staffWeekly, talkBlock } from "./v7";
import type { Executive, GameState, Offer } from "./types";

const catalog = fixtureCatalog();

function fresh(cityId = "los-angeles", seed = 7): GameState {
  return createGame({ agencyName: "Paper Lantern", era: "today", seed, catalog, cityId });
}

describe("v7 location", () => {
  it("keeps tentpoles in a major hub and makes them rare elsewhere", () => {
    let major = 0;
    let local = 0;
    for (let i = 0; i < 200; i++) {
      if (keepBigOffer("major", "tentpole", 40, 16, i / 200)) major += 1;
      if (keepBigOffer("local", "tentpole", 40, 16, i / 200)) local += 1;
    }
    expect(major).toBe(200);
    expect(local).toBeGreaterThan(8);
    expect(local).toBeLessThan(50);
    expect(keepBigOffer("local", "tentpole", 90, 70, 0.8)).toBe(true);
    expect(keepBigOffer("local", "tentpole", 90, 70, 0.05)).toBe(false);
  });

  it("charges less rent outside Los Angeles and still offers a few big films", () => {
    const la = fresh("los-angeles", 3);
    const lagos = fresh("lagos", 3);
    expect(la.agency.rent).toBeGreaterThan(lagos.agency.rent);
    expect(lagos.rivals.length).toBeGreaterThanOrEqual(30);
    const run = (cityId: string) => {
      let state = fresh(cityId, 21);
      const signed = signClient(state, catalog, 4, { commission: 10, years: 4, exclusive: true, exitClause: true });
      state = signed.state;
      const client = state.clients.find((row) => row.personId === 4)!;
      client.fame = "Icon";
      client.filmStar = 90;
      state = advanceWeeks(state, catalog, 40, { autoResolveEvents: true }).state;
      return state.offers.filter((offer) => state.projects.find((project) => project.id === offer.projectId)?.budgetTier === "tentpole").length;
    };
    expect(run("los-angeles")).toBeGreaterThanOrEqual(run("lagos"));
  });
});

describe("v7 office, decisions, staff, bonuses", () => {
  it("migrates an old save without dropping the roster", () => {
    const state = fresh();
    const signed = signClient(state, catalog, 8, { commission: 10, years: 2, exclusive: true, exitClause: true });
    const next = signed.state;
    next.agency.cityId = undefined;
    next.rivals = next.rivals.slice(0, 3);
    for (const rival of next.rivals) rival.cityId = undefined;
    migrateCareer(next);
    expect(next.agency.cityId).toBe("los-angeles");
    expect(next.rivals.length).toBeGreaterThanOrEqual(30);
    expect(next.clients.some((client) => client.personId === 8 && client.agency === "player")).toBe(true);
    migrateCareer(next);
    expect(next.rivals.length).toBeGreaterThanOrEqual(30);
  });

  it("buys an upgrade, moves city, and blocks the week on an open offer", () => {
    let state = fresh();
    const bought = buyUpgrade(state, "lounge");
    expect(bought.ok).toBe(true);
    expect(state.agency.upgrades).toContain("lounge");
    expect(staffWeekly(state)).toBeGreaterThan(0);
    const before = state.clients.filter((client) => client.agency === "player");
    const moved = relocateAgency(state, "toronto");
    expect(moved.ok).toBe(true);
    expect(state.agency.relocating?.cityId).toBe("toronto");
    for (const client of before) expect(client.loyalty).toBeLessThanOrEqual(99);
    const signed = signClient(state, catalog, 6, { commission: 10, years: 2, exclusive: true, exitClause: true });
    state = signed.state;
    state.offers.push({
      id: "off_decision",
      projectId: state.projects[0]!.id,
      personId: 6,
      role: "Lead",
      character: "Lead",
      fee: 100_000,
      billing: 1,
      backend: 0,
      prestige: 40,
      risk: 20,
      feeWhy: "",
      prestigeWhy: "",
      riskWhy: "",
      scriptNote: "",
      expires: addWeeks(state.date, 3),
      status: "pending",
      walkAwayFee: 120_000,
      walkAwayBackend: 0,
      minBilling: 1,
      dateFlexible: false,
      perkAvailable: false,
      perk: null,
      dateShiftWeeks: 0,
      studio: "Test",
      created: { ...state.date },
    } satisfies Offer);
    expect(openDecisions(state).some((row) => row.id === "off_decision")).toBe(true);
  });

  it("escalates a huge offer and accepts routine autonomy", () => {
    let state = fresh();
    const signed = signClient(state, catalog, 10, { commission: 10, years: 2, exclusive: true, exitClause: true });
    state = signed.state;
    const hired = hireAgent(state);
    expect(hired.ok).toBe(true);
    const agent = state.agents![0]!;
    expect(assignAgent(state, 10, agent.id).ok).toBe(true);
    setAgent(state, agent.id, { autonomy: "threshold", feeThreshold: 50_000 });
    const client = state.clients.find((row) => row.personId === 10)!;
    client.loyalty = 70;
    const offer = { fee: 2_000_000, personId: 10, projectId: "none", pay: "flat", deal: undefined } as Offer;
    expect(agentPlan(state, offer)).toBe("escalate");
    expect(agentPlan(state, { ...offer, fee: 10_000 })).not.toBe("escalate");
    expect(assignAgent(state, 10, agent.id).ok).toBe(true);
    for (let n = 0; n < 6; n += 1) {
      const other = state.clients.find((client) => client.agency !== "player");
      if (!other) break;
      other.agency = "player";
      other.contract = { commission: 10, start: { ...state.date }, termYears: 1, exclusive: true, exitClause: true };
      other.agentId = agent.id;
    }
    const overflow = state.clients.find((client) => client.agency === "player" && client.agentId !== agent.id);
    if (overflow) expect(assignAgent(state, overflow.personId, agent.id).ok).toBe(false);
  });

  it("lets a full-autonomy agent settle brand deals and talk invites", () => {
    let state = fresh();
    state = signClient(state, catalog, 10, { commission: 10, years: 2, exclusive: true, exitClause: true }).state;
    expect(hireAgent(state).ok).toBe(true);
    const agent = state.agents![0]!;
    expect(assignAgent(state, 10, agent.id).ok).toBe(true);
    const client = state.clients.find((row) => row.personId === 10)!;

    setAgent(state, agent.id, { autonomy: "important" });
    expect(agentHandles(state, 10, 100_000)).toBe(false);
    setAgent(state, agent.id, { autonomy: "threshold", feeThreshold: 50_000 });
    expect(agentHandles(state, 10, 100_000)).toBe(false);
    expect(agentHandles(state, 10, 10_000)).toBe(true);
    setAgent(state, agent.id, { autonomy: "full" });
    expect(agentHandles(state, 10, 5_000_000)).toBe(true);
    client.agentId = null;
    expect(agentHandles(state, 10, 1)).toBe(false);
    client.agentId = agent.id;

    state.brandDeals.unshift({
      id: "brand_test",
      personId: 10,
      personName: client.name,
      brand: "Test Brand",
      fee: 200_000,
      start: { ...state.date },
      end: addWeeks(state.date, 12),
      status: "offered",
    });
    state.talkInvites = [{ id: "tinv_test", personId: 10, showId: "fallon", date: { ...state.date }, status: "pending" }];
    const next = advanceWeeks(state, catalog, 1, { autoResolveEvents: false }).state;
    expect(next.brandDeals.find((deal) => deal.id === "brand_test")?.status).not.toBe("offered");
    expect(next.talkInvites?.find((row) => row.id === "tinv_test")?.status).not.toBe("pending");
  });

  it("pays a profit bonus and skips it in a loss year", () => {
    const state = fresh();
    state.executives = [{
      id: "ex",
      role: "CFO",
      name: "Ada Cole",
      skill: 70,
      loyalty: 60,
      greed: 40,
      salary: 9000,
      bonusRate: 0.03,
      retentionBonus: 0,
      years: 3,
      kpi: false,
      risk: 20,
      started: { ...state.date },
    } satisfies Executive];
    expect(projectedBonus(state, 1_000_000)).toBe(30_000);
    expect(projectedBonus(state, -20_000)).toBe(0);
    state.executives[0]!.kpi = true;
    expect(projectedBonus(state, 1_000_000)).toBe(33_000);
  });

  it("blocks a talk show during a shoot and records a directing hold", () => {
    let state = fresh();
    const signed = signClient(state, catalog, 12, { commission: 10, years: 3, exclusive: true, exitClause: true });
    state = signed.state;
    const client = state.clients.find((row) => row.personId === 12)!;
    client.directingAptitude = 80;
    state.events.unshift({
      id: "evt_direct",
      type: "wants_direct",
      title: `${client.name} wants to direct`,
      body: "Debut",
      personId: 12,
      date: { ...state.date },
      expires: addWeeks(state.date, 2),
      choices: [
        { id: "direct_back", label: "Back", hint: "" },
        { id: "direct_small", label: "Small", hint: "" },
        { id: "direct_talk", label: "Talk", hint: "" },
      ],
    });
    const backed = applyEventChoice(state, "evt_direct", "direct_back");
    expect(backed.ok).toBe(true);
    expect(backed.state.clients.find((row) => row.personId === 12)?.primaryFocus).toBe("Both");
    expect(scheduleConflict(backed.state, 12, backed.state.date, addWeeks(backed.state.date, 2))).toBeTruthy();
    expect(talkBlock(backed.state, 12)).toBeTruthy();
  });
});

describe("v7 rivals", () => {
  it("merges, collapses, and prints headlines without moving the id counter", () => {
    const state = fresh("los-angeles", 9);
    const seq = state.seq;
    for (const rival of state.rivals) {
      if (rival.size === "boutique") rival.health = 8;
    }
    for (let step = 0; step < 120; step++) {
      state.date = addWeeks(state.date, 1);
      tickRivals(state);
    }
    expect(state.seq).toBe(seq);
    expect(state.rivals.slice(0, 3).map((row) => row.id)).toEqual(["meridian", "northvale", "atlas"]);
    expect((state.rivalNotes ?? []).length).toBeGreaterThan(0);
    const headlines = (state.rivalNotes ?? []).map((row) => row.text).join(" ");
    expect(/folded|closed|opened|signed|dropped|productions/.test(headlines)).toBe(true);
  });

  it("signs a notable away from the shop that lists them", () => {
    const state = fresh();
    const person = catalog.actors.find((actor) => !state.clients.some((client) => client.personId === actor.id));
    expect(person).toBeTruthy();
    const boutique = state.rivals.find((row) => row.size === "boutique")!;
    boutique.notableIds = [person!.id];
    const signed = signClient(state, catalog, person!.id, { commission: 5, years: 2, exclusive: false, exitClause: true });
    expect(signed.ok).toBe(true);
    const client = signed.state.clients.find((row) => row.personId === person!.id);
    expect(client?.agency).toBe("player");
    expect(client?.rivalId).toBeNull();
  });

  it("simulates several cities for years without stalling", () => {
    const started = Date.now();
    for (const cityId of ["los-angeles", "lagos", "toronto"]) {
      let state = fresh(cityId, 11);
      const signed = signClient(state, catalog, 14, { commission: 10, years: 5, exclusive: true, exitClause: true });
      state = signed.state;
      for (let year = 0; year < 5; year++) state = advanceWeeks(state, catalog, 52, { autoResolveEvents: true }).state;
      expect(state.rivals.length).toBeGreaterThan(10);
      expect(state.date.year).toBeGreaterThanOrEqual(2030);
    }
    expect(Date.now() - started).toBeLessThan(60_000);
  }, 60_000);
});

describe("v7 publicity, executives, and unread mail", () => {
  it("counts informational mail and leaves decisions unread", () => {
    const state = fresh();
    state.events.unshift({
      id: "evt_open",
      type: "viral",
      title: "A decision",
      body: "Choose",
      date: { ...state.date },
      expires: addWeeks(state.date, 2),
      choices: [{ id: "stay_quiet", label: "Let it pass", hint: "" }],
    });
    state.inbox.push(
      {
        id: "in_dec",
        date: { ...state.date },
        kind: "event",
        title: "A decision",
        body: "Choose",
        read: false,
        resolved: false,
        refId: "evt_open",
      },
      {
        id: "in_note",
        date: { ...state.date },
        kind: "system",
        title: "A quiet note",
        body: "Nothing to decide.",
        read: false,
        resolved: false,
      },
    );
    expect(informationalUnread(state)).toBeGreaterThan(0);
    expect(openDecisions(state).some((row) => row.id === "evt_open")).toBe(true);
    markInformationalRead(state);
    expect(informationalUnread(state)).toBe(0);
    expect(state.inbox.find((item) => item.id === "in_dec")?.read).toBe(false);
    expect(state.inbox.find((item) => item.id === "in_note")?.read).toBe(true);
    expect(openDecisions(state).some((row) => row.id === "evt_open")).toBe(true);
  });

  it("finishes a social campaign and books a satellite once the shop is established", () => {
    let state = fresh();
    const signed = signClient(state, catalog, 10, { commission: 10, years: 2, exclusive: true, exitClause: true });
    state = signed.state;
    expect(hirePublicist(state, "Social").ok).toBe(true);
    expect(launchCampaign(state, "social", 10).ok).toBe(true);
    state.campaigns![0]!.weeksLeft = 1;
    const beforeReach = state.clients.find((row) => row.personId === 10)!.socialReach ?? 0;
    state = advanceWeeks(state, catalog, 1, { autoResolveEvents: false }).state;
    const after = state.clients.find((row) => row.personId === 10)!;
    expect(state.campaigns?.[0]?.note).toBe("Finished");
    expect(after.socialReach ?? 0).toBeGreaterThan(beforeReach);
    expect(openSatellite(state, "london").ok).toBe(false);
    state.agency.tier = "Established";
    expect(openSatellite(state, "london").ok).toBe(true);
    expect(state.agency.satellites?.[0]?.cityId).toBe("london");
    expect(staffWeekly(state)).toBeGreaterThan(0);
  });

  it("hires a CFO inside the delegation limits and pays the bonus on week 2", () => {
    let state = fresh();
    for (const id of [4, 5, 6, 8]) {
      const signed = signClient(state, catalog, id, { commission: 10, years: 2, exclusive: true, exitClause: true });
      if (signed.ok) state = signed.state;
    }
    state.agency.tier = "Established";
    state.agency.reputation = 55;
    expect(hireExecutive(state, "CFO").ok).toBe(true);
    setExecLimits(state, 250_000, 40);
    expect(state.execBudget).toBe(250_000);
    expect(state.execRisk).toBe(40);
    state.ledger.push({ date: { year: state.date.year - 1, week: 10 }, label: "Series commission", amount: 1_000_000, balance: state.agency.cash });
    state.executives![0]!.kpi = false;
    state.executives![0]!.bonusRate = 0.03;
    state = advanceWeeks(state, catalog, 1, { autoResolveEvents: false }).state;
    expect(state.profitYears?.some((row) => row.year === state.date.year - 1 && row.bonus === 30_000)).toBe(true);
    expect(state.ledger.some((row) => row.label === "Executive profit bonus" && row.amount === -30_000)).toBe(true);
  });

  it("moves an older actor with a strong debut into directing", () => {
    let state = fresh();
    const signed = signClient(state, catalog, 16, { commission: 10, years: 3, exclusive: true, exitClause: true });
    state = signed.state;
    const client = state.clients.find((row) => row.personId === 16)!;
    client.birthday = "1970-01-01";
    client.directingAptitude = 80;
    state.events.unshift({
      id: "evt_old_direct",
      type: "wants_direct",
      title: `${client.name} wants to direct`,
      body: "Debut",
      personId: 16,
      date: { ...state.date },
      expires: addWeeks(state.date, 2),
      choices: [{ id: "direct_back", label: "Back", hint: "" }],
    });
    const backed = applyEventChoice(state, "evt_old_direct", "direct_back");
    expect(backed.state.clients.find((row) => row.personId === 16)?.primaryFocus).toBe("Director");
    state.talkBookings = [{ id: "tb", personId: 4, showId: "kimmel", date: { ...state.date }, result: "fine" }];
    expect(talkBlock(state, 4)).toBe("Already on a show this week.");
  });
});
