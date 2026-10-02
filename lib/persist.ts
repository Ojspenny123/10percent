import { Prisma } from "@prisma/client";
import type { GameState } from "@/engine/types";
import { parseState } from "@/lib/parse-state";
import { prisma } from "@/lib/prisma";
import {
  chunkKey,
  joinState,
  planCommit,
  recordFromState,
  SaveConflictError,
  type Chunk,
  type ListKey,
  type SaveHead,
  type SlotRecord,
} from "@/lib/save-diff";

type SlotRow = {
  id: string;
  slot: number;
  name: string;
  agencyName: string;
  era: string;
  year: number;
  week: number;
  cash: number;
  roster: number;
  saveVersion: number;
  savedAt: Date;
  state: Prisma.JsonValue;
  head: Prisma.JsonValue | null;
  updatedAt: Date;
  chunks?: { kind: string; entityId: string; payload: Prisma.JsonValue; saveVersion: number }[];
};

export type LoadedSlot = SlotRecord & { state: GameState };

function isModern(head: Prisma.JsonValue | null): head is SaveHead {
  return Boolean(head && typeof head === "object" && !Array.isArray(head) && "order" in head && "rng" in head && "agency" in head);
}

function asHead(value: Prisma.JsonValue): SaveHead {
  return value as unknown as SaveHead;
}

function rowToRecord(row: SlotRow): SlotRecord {
  if (!isModern(row.head)) throw new Error("This save could not be read.");
  const chunks: Chunk[] = (row.chunks ?? []).map((chunk) => ({
    kind: chunk.kind as ListKey,
    entityId: chunk.entityId,
    payload: chunk.payload,
  }));
  return {
    id: row.id,
    slot: row.slot,
    saveVersion: row.saveVersion,
    savedAt: row.savedAt.toISOString(),
    head: asHead(row.head),
    chunks,
    cash: row.cash,
    roster: row.roster,
    agencyName: row.agencyName,
    era: row.era,
    year: row.year,
    week: row.week,
    name: row.name,
  };
}

function chunkData(slotId: string, chunks: Chunk[], saveVersion: number) {
  return chunks.map((chunk) => ({
    slotId,
    kind: chunk.kind,
    entityId: chunk.entityId,
    payload: chunk.payload as Prisma.InputJsonValue,
    saveVersion,
  }));
}

async function writeSnapshot(id: string, record: SlotRecord, savedAt: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.saveSlot.findUnique({ where: { id } });
    if (!current) throw new Error("That save is gone.");
    if (isModern(current.head)) return;
    await tx.saveChunk.deleteMany({ where: { slotId: id } });
    if (record.chunks.length) {
      await tx.saveChunk.createMany({ data: chunkData(id, record.chunks, record.saveVersion) });
    }
    const claimed = await tx.saveSlot.updateMany({
      where: { id, saveVersion: current.saveVersion },
      data: {
        saveVersion: record.saveVersion,
        savedAt,
        head: record.head as unknown as Prisma.InputJsonValue,
        cash: record.cash,
        roster: record.roster,
        agencyName: record.agencyName,
        era: record.era,
        year: record.year,
        week: record.week,
        name: record.name,
        state: {} as Prisma.InputJsonValue,
      },
    });
    if (claimed.count !== 1) throw new SaveConflictError("This save was updated. Reload before you continue.");
  }, { timeout: 20_000 });
}

async function ensureModern(row: SlotRow): Promise<SlotRow> {
  if (isModern(row.head)) return row;
  const legacy = row.state;
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy) || !("agency" in legacy)) {
    throw new Error("This save could not be read.");
  }
  try {
    const state = parseState(legacy);
    const record = recordFromState(row.id, row.slot, state, row.updatedAt.toISOString());
    await writeSnapshot(row.id, record, row.updatedAt);
  } catch (error) {
    const again = await prisma.saveSlot.findUnique({ where: { id: row.id }, include: { chunks: true } });
    if (again && isModern(again.head)) return again;
    throw error;
  }
  const fresh = await prisma.saveSlot.findUnique({ where: { id: row.id }, include: { chunks: true } });
  if (!fresh || !isModern(fresh.head)) throw new Error("This save could not be read.");
  return fresh;
}

function toLoaded(row: SlotRow): LoadedSlot {
  const record = rowToRecord(row);
  return { ...record, state: joinState(record.head, record.chunks) };
}

export async function loadSlot(id: string): Promise<LoadedSlot | null> {
  const row = await prisma.saveSlot.findUnique({ where: { id }, include: { chunks: true } });
  if (!row) return null;
  return toLoaded(await ensureModern(row));
}

export async function listSlots(): Promise<LoadedSlot[]> {
  const rows = await prisma.saveSlot.findMany({ include: { chunks: true }, orderBy: { slot: "asc" } });
  const loaded: LoadedSlot[] = [];
  for (const row of rows) loaded.push(toLoaded(await ensureModern(row)));
  return loaded;
}

export async function commitSlot(id: string, expectedVersion: number, state: GameState, savedAt = new Date()): Promise<{ saveVersion: number; savedAt: string }> {
  const iso = savedAt.toISOString();
  return prisma.$transaction(async (tx) => {
    const row = await tx.saveSlot.findUnique({ where: { id }, include: { chunks: true } });
    if (!row) throw new Error("That save is gone.");
    if (!isModern(row.head)) throw new Error("This save could not be read.");
    const planned = planCommit(rowToRecord(row), expectedVersion, state, iso);
    const existing = new Set(row.chunks.map((chunk) => chunkKey({ kind: chunk.kind as ListKey, entityId: chunk.entityId })));
    const creates = planned.upserts.filter((chunk) => !existing.has(chunkKey(chunk)));
    const updates = planned.upserts.filter((chunk) => existing.has(chunkKey(chunk)));
    if (creates.length) await tx.saveChunk.createMany({ data: chunkData(id, creates, planned.record.saveVersion) });
    for (const chunk of updates) {
      await tx.saveChunk.update({
        where: { slotId_kind_entityId: { slotId: id, kind: chunk.kind, entityId: chunk.entityId } },
        data: { payload: chunk.payload as Prisma.InputJsonValue, saveVersion: planned.record.saveVersion },
      });
    }
    if (planned.deletes.length) {
      await tx.saveChunk.deleteMany({
        where: { slotId: id, OR: planned.deletes.map((item) => ({ kind: item.kind, entityId: item.entityId })) },
      });
    }
    const claimed = await tx.saveSlot.updateMany({
      where: { id, saveVersion: expectedVersion },
      data: {
        saveVersion: planned.record.saveVersion,
        savedAt,
        head: planned.record.head as unknown as Prisma.InputJsonValue,
        cash: planned.record.cash,
        roster: planned.record.roster,
        agencyName: planned.record.agencyName,
        era: planned.record.era,
        year: planned.record.year,
        week: planned.record.week,
        name: planned.record.name,
        state: {} as Prisma.InputJsonValue,
      },
    });
    if (claimed.count !== 1) throw new SaveConflictError();
    return { saveVersion: planned.record.saveVersion, savedAt: iso };
  }, { timeout: 20_000 });
}

export async function writeNewGame(slotNumber: number, state: GameState): Promise<{ id: string; saveVersion: number }> {
  const now = new Date();
  const draft = recordFromState("new", slotNumber, state, now.toISOString());
  return prisma.$transaction(async (tx) => {
    const existing = await tx.saveSlot.findUnique({ where: { slot: slotNumber } });
    const data = {
      name: draft.name,
      agencyName: draft.agencyName,
      era: draft.era,
      year: draft.year,
      week: draft.week,
      cash: draft.cash,
      roster: draft.roster,
      saveVersion: 1,
      savedAt: now,
      state: {} as Prisma.InputJsonValue,
      head: draft.head as unknown as Prisma.InputJsonValue,
    };
    const row = existing
      ? await tx.saveSlot.update({ where: { id: existing.id }, data })
      : await tx.saveSlot.create({ data: { slot: slotNumber, ...data } });
    if (existing) await tx.saveChunk.deleteMany({ where: { slotId: row.id } });
    if (draft.chunks.length) await tx.saveChunk.createMany({ data: chunkData(row.id, draft.chunks, 1) });
    return { id: row.id, saveVersion: 1 };
  }, { timeout: 20_000 });
}

export async function copySlot(sourceId: string, expectedVersion: number): Promise<{ id: string; slot: number }> {
  return prisma.$transaction(async (tx) => {
    const source = await tx.saveSlot.findUnique({ where: { id: sourceId }, include: { chunks: true } });
    if (!source) throw new Error("That save is gone.");
    if (source.saveVersion !== expectedVersion) throw new SaveConflictError();
    const used = await tx.saveSlot.findMany({ select: { slot: true } });
    const open = [1, 2, 3, 4, 5].find((slot) => !used.some((row) => row.slot === slot));
    if (!open) throw new Error("All five slots are full. Delete one from the Game menu first.");
    const created = await tx.saveSlot.create({
      data: {
        slot: open,
        name: source.name,
        agencyName: source.agencyName,
        era: source.era,
        year: source.year,
        week: source.week,
        cash: source.cash,
        roster: source.roster,
        saveVersion: 1,
        savedAt: new Date(),
        state: {} as Prisma.InputJsonValue,
        head: (source.head ?? {}) as Prisma.InputJsonValue,
      },
    });
    if (source.chunks.length) {
      await tx.saveChunk.createMany({
        data: source.chunks.map((chunk) => ({
          slotId: created.id,
          kind: chunk.kind,
          entityId: chunk.entityId,
          payload: chunk.payload as Prisma.InputJsonValue,
          saveVersion: 1,
        })),
      });
    }
    return { id: created.id, slot: open };
  });
}

export async function deleteSlot(id: string): Promise<void> {
  await prisma.saveSlot.delete({ where: { id } });
}
