import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceWeeks } from "@/engine/turn";
import { createGame } from "@/engine/create";
import { fixtureCatalog } from "@/engine/fixture";
import type { GameState } from "@/engine/types";
import { parseState } from "@/lib/parse-state";
import { prisma } from "@/lib/prisma";
import { commitSlot, loadSlot, writeNewGame } from "@/lib/persist";
import { SaveConflictError, statesMatch } from "@/lib/save-diff";

const catalog = fixtureCatalog();
const SLOT = 99;
const LEGACY = 98;

function fresh(seed: number): GameState {
  return createGame({ agencyName: "Ledger Test", era: "today", seed, catalog });
}

async function databaseReady(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const ready = await databaseReady();

describe.skipIf(!ready)("persist", () => {
  beforeAll(async () => {
    await prisma.saveSlot.deleteMany({ where: { slot: { in: [SLOT, LEGACY] } } });
  });

  afterAll(async () => {
    await prisma.saveSlot.deleteMany({ where: { slot: { in: [SLOT, LEGACY] } } });
    await prisma.$disconnect();
  });

  it("saves each week, reloads the same state, and continues the rng", async () => {
    const start = fresh(21);
    const created = await writeNewGame(SLOT, start);
    let version = created.saveVersion;
    let state = start;
    for (let week = 0; week < 3; week++) {
      const advanced = advanceWeeks(state, catalog, 1, { autoResolveEvents: false });
      const saved = await commitSlot(created.id, version, advanced.state);
      version = saved.saveVersion;
      state = advanced.state;
    }
    const loaded = await loadSlot(created.id);
    expect(loaded).not.toBeNull();
    expect(statesMatch(loaded!.state, state)).toBe(true);
    expect(loaded!.saveVersion).toBe(4);
    const afterLoad = advanceWeeks(loaded!.state, catalog, 1, { autoResolveEvents: false });
    const continuous = advanceWeeks(fresh(21), catalog, 4, { autoResolveEvents: false });
    expect(afterLoad.state.rng).toEqual(continuous.state.rng);
    expect(afterLoad.state.date).toEqual(continuous.state.date);
    expect(statesMatch(afterLoad.state, continuous.state)).toBe(true);
  });

  it("rolls back a week when the transaction crashes", async () => {
    const loaded = await loadSlot((await prisma.saveSlot.findUniqueOrThrow({ where: { slot: SLOT } })).id);
    expect(loaded).not.toBeNull();
    const beforeCash = loaded!.cash;
    await expect(prisma.$transaction(async (tx) => {
      await tx.saveSlot.update({ where: { id: loaded!.id }, data: { cash: -999 } });
      await tx.saveChunk.create({
        data: {
          slotId: loaded!.id,
          kind: "projects",
          entityId: "crash-probe",
          payload: { id: "crash-probe" },
          saveVersion: 99,
        },
      });
      throw new Error("crash");
    })).rejects.toThrow("crash");
    const again = await loadSlot(loaded!.id);
    expect(again!.cash).toBe(beforeCash);
    expect(again!.chunks.some((chunk) => chunk.entityId === "crash-probe")).toBe(false);
    expect(statesMatch(again!.state, loaded!.state)).toBe(true);
  });

  it("refuses a stale version", async () => {
    const row = await prisma.saveSlot.findUniqueOrThrow({ where: { slot: SLOT } });
    const loaded = await loadSlot(row.id);
    await expect(commitSlot(row.id, loaded!.saveVersion - 1, loaded!.state)).rejects.toBeInstanceOf(SaveConflictError);
    const again = await loadSlot(row.id);
    expect(again!.saveVersion).toBe(loaded!.saveVersion);
  });

  it("migrates a legacy full-json save without dropping it", async () => {
    const state = fresh(8);
    const row = await prisma.saveSlot.create({
      data: {
        slot: LEGACY,
        name: state.agency.name,
        agencyName: state.agency.name,
        era: state.era,
        year: state.date.year,
        week: state.date.week,
        state: state as unknown as Prisma.InputJsonValue,
      },
    });
    const loaded = await loadSlot(row.id);
    const expected = parseState(structuredClone(state));
    expect(statesMatch(loaded!.state, expected)).toBe(true);
    expect(loaded!.saveVersion).toBe(1);
    const stored = await prisma.saveSlot.findUnique({ where: { id: row.id }, include: { chunks: true } });
    expect(stored!.chunks.length).toBeGreaterThan(0);
    expect(stored!.state).toEqual({});
    expect(stored!.head).toBeTruthy();
  });
});
