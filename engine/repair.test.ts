import { describe, expect, it } from "vitest";
import { migrateCareer } from "./career";
import { createGame } from "./create";
import { fixtureCatalog } from "./fixture";
import { addWeeks } from "./schedule";
import type { GameState } from "./types";
import { openDecisions } from "./v7";

const catalog = fixtureCatalog();

function fresh(): GameState {
  return createGame({ agencyName: "Paper Lantern", era: "today", seed: 7, catalog });
}

describe("stuck-state repair", () => {
  it("drops expired and orphaned decisions so the week can advance", () => {
    const state = fresh();
    const past = addWeeks(state.date, -3);
    state.events.push({
      id: "evt_dead",
      type: "test",
      title: "Old choice",
      body: "Expired.",
      date: past,
      expires: past,
      choices: [{ id: "a", label: "A", hint: "" }],
    });
    state.events.push({
      id: "evt_empty",
      type: "test",
      title: "No choices",
      body: "Broken.",
      date: state.date,
      expires: addWeeks(state.date, 2),
      choices: [],
    });
    state.offers.push({
      id: "off_orphan",
      projectId: "missing",
      personId: state.clients[0]?.personId ?? 1,
      role: "Lead",
      character: "Sam",
      fee: 1000,
      billing: 1,
      backend: 0,
      prestige: 40,
      risk: 40,
      feeWhy: "",
      prestigeWhy: "",
      riskWhy: "",
      scriptNote: "",
      expires: addWeeks(state.date, 2),
      status: "pending",
      walkAwayFee: 2000,
      walkAwayBackend: 2,
      minBilling: 2,
      dateFlexible: false,
      perkAvailable: false,
      perk: null,
      dateShiftWeeks: 0,
      studio: "Test",
      created: state.date,
    });
    state.approaches.push({
      id: "app_old",
      personId: 1,
      name: "Old",
      profilePath: null,
      fame: "Working",
      pitch: "",
      line: "",
      opening: { commission: 10, termYears: 2, exclusive: true, exitClause: true },
      ask: { commission: 10, termYears: 2, exclusive: true, exitClause: true },
      desiredCommission: 10,
      walkAwayCommission: 12,
      expires: past,
      status: "pending",
    });
    migrateCareer(state);
    const open = openDecisions(state);
    expect(open.some((row) => row.id === "evt_dead" || row.id === "evt_empty" || row.id === "off_orphan" || row.id === "app_old")).toBe(false);
    expect(state.offers.find((row) => row.id === "off_orphan")?.status).toBe("expired");
    expect(state.events.find((row) => row.id === "evt_dead")?.resolved).toBe("expired");
    expect(state.approaches.find((row) => row.id === "app_old")?.status).toBe("expired");
  });
});
