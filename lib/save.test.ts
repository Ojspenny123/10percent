import { describe, expect, it } from "vitest";
import { advanceWeeks } from "@/engine/turn";
import { createGame } from "@/engine/create";
import { fixtureCatalog } from "@/engine/fixture";
import type { GameState } from "@/engine/types";
import {
  applyRecord,
  joinState,
  planCommit,
  recordFromState,
  runTransaction,
  SaveConflictError,
  statesMatch,
  type SlotRecord,
} from "@/lib/save-diff";
import { PartialSaveError, saveEachWeek } from "@/lib/save-weeks";

const catalog = fixtureCatalog();
const savedAt = "2026-10-02T12:00:00.000Z";

function fresh(seed = 7): GameState {
  return createGame({ agencyName: "Paper Lantern", era: "today", seed, catalog });
}

function openRecord(state: GameState, id = "slot-a"): SlotRecord {
  return recordFromState(id, 1, state, savedAt);
}

describe("save deltas", () => {
  it("keeps both inbox notes when a legacy save reused an id", () => {
    const state = fresh();
    const extra = { ...state.inbox[0]!, id: state.inbox[0]!.id, title: "Second note", body: "Kept" };
    state.inbox.push(extra);
    const record = openRecord(state);
    const loaded = joinState(structuredClone(record.head), structuredClone(record.chunks));
    expect(loaded.inbox.filter((item) => item.id === extra.id)).toHaveLength(2);
    expect(loaded.inbox.some((item) => item.title === "Second note")).toBe(true);
    expect(record.chunks.filter((chunk) => chunk.kind === "inbox")).toHaveLength(state.inbox.length);
  });

  it("reloads a split save as the same state", () => {
    const state = fresh();
    const record = openRecord(state);
    expect(statesMatch(joinState(record.head, record.chunks), state)).toBe(true);
    expect(record.head.seed).toBe(state.seed);
    expect(record.head.rng).toEqual(state.rng);
  });

  it("writes only the chunk that changed", () => {
    const state = fresh();
    const record = openRecord(state);
    const next = structuredClone(state);
    next.projects[0]!.title = "A Different Picture";
    const planned = planCommit(record, record.saveVersion, next, savedAt);
    expect(planned.upserts.filter((chunk) => chunk.kind === "projects")).toHaveLength(1);
    expect(planned.upserts.filter((chunk) => chunk.kind === "clients")).toHaveLength(0);
    expect(planned.deletes).toHaveLength(0);
    expect(planned.record.saveVersion).toBe(2);
  });

  it("rejects a stale version from another tab", () => {
    const state = fresh();
    const record = openRecord(state);
    const first = planCommit(record, 1, state, savedAt);
    applyRecord(record, first.record);
    expect(() => planCommit(record, 1, state, savedAt)).toThrow(SaveConflictError);
  });
});

describe("weekly autosave", () => {
  it("saves after each simulated week and reloads equal state", async () => {
    const start = fresh(21);
    const record = openRecord(start);
    const versions: number[] = [];
    const result = await saveEachWeek({
      state: start,
      version: record.saveVersion,
      weeks: 4,
      catalog,
      stopOnEvent: false,
      commit: async (version, state) => {
        const planned = planCommit(record, version, state, savedAt);
        expect(planned.upserts.length + planned.deletes.length).toBeGreaterThan(0);
        applyRecord(record, planned.record);
        versions.push(planned.record.saveVersion);
        return { saveVersion: planned.record.saveVersion };
      },
    });
    expect(versions).toEqual([2, 3, 4, 5]);
    expect(result.stepped).toBe(4);
    const loaded = joinState(record.head, record.chunks);
    const direct = advanceWeeks(fresh(21), catalog, 4, { autoResolveEvents: false });
    expect(statesMatch(loaded, direct.state)).toBe(true);
    expect(statesMatch(loaded, result.state)).toBe(true);
  });

  it("keeps earlier weeks when a later week crashes", async () => {
    const start = fresh(5);
    const record = openRecord(start);
    let calls = 0;
    await expect(saveEachWeek({
      state: start,
      version: 1,
      weeks: 3,
      catalog,
      stopOnEvent: false,
      commit: async (version, state) => {
        calls += 1;
        return runTransaction(record, () => {
          if (calls === 2) throw new Error("crash");
          const planned = planCommit(record, version, state, savedAt);
          applyRecord(record, planned.record);
          return { saveVersion: planned.record.saveVersion };
        });
      },
    })).rejects.toMatchObject({ name: "PartialSaveError", stepped: 1, kind: "failed" });
    const week1 = advanceWeeks(fresh(5), catalog, 1, { autoResolveEvents: false });
    expect(record.saveVersion).toBe(2);
    expect(statesMatch(joinState(record.head, record.chunks), week1.state)).toBe(true);
    expect(calls).toBe(2);
  });

  it("continues the rng identically after a load", () => {
    const start = fresh(9);
    const record = openRecord(start);
    let cursor = start;
    for (let week = 0; week < 3; week++) {
      const advanced = advanceWeeks(cursor, catalog, 1, { autoResolveEvents: false });
      const planned = planCommit(record, record.saveVersion, advanced.state, savedAt);
      applyRecord(record, planned.record);
      cursor = advanced.state;
    }
    const loaded = joinState(record.head, record.chunks);
    const afterLoad = advanceWeeks(loaded, catalog, 1, { autoResolveEvents: false });
    const continuous = advanceWeeks(fresh(9), catalog, 4, { autoResolveEvents: false });
    expect(afterLoad.state.date).toEqual(continuous.state.date);
    expect(afterLoad.state.rng).toEqual(continuous.state.rng);
    expect(afterLoad.state.seed).toBe(continuous.state.seed);
    expect(statesMatch(afterLoad.state, continuous.state)).toBe(true);
  });

  it("rolls a mid-turn write back to the previous week", () => {
    const start = fresh(3);
    const record = openRecord(start);
    const week1 = advanceWeeks(start, catalog, 1, { autoResolveEvents: false });
    applyRecord(record, planCommit(record, 1, week1.state, savedAt).record);
    const snapshot = structuredClone(record);
    expect(() => {
      runTransaction(record, () => {
        const week2 = advanceWeeks(week1.state, catalog, 1, { autoResolveEvents: false });
        applyRecord(record, planCommit(record, record.saveVersion, week2.state, savedAt).record);
        throw new Error("crash");
      });
    }).toThrow("crash");
    expect(record.saveVersion).toBe(snapshot.saveVersion);
    expect(statesMatch(joinState(record.head, record.chunks), week1.state)).toBe(true);
    expect(statesMatch(joinState(record.head, record.chunks), joinState(snapshot.head, snapshot.chunks))).toBe(true);
  });
});

describe("partial save errors", () => {
  it("names a conflict without pretending the week was stored", () => {
    const error = new PartialSaveError(0, new SaveConflictError());
    expect(error.kind).toBe("conflict");
    expect(error.stepped).toBe(0);
    expect(error.message).toContain("another tab");
  });
});
