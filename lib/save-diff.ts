import type { GameState } from "@/engine/types";
import { parseState } from "@/lib/parse-state";

export const LIST_KEYS = [
  "clients",
  "projects",
  "offers",
  "approaches",
  "events",
  "inbox",
  "news",
  "awards",
  "festivals",
  "holds",
  "brandDeals",
] as const;

export type ListKey = (typeof LIST_KEYS)[number];

export type Chunk = {
  kind: ListKey;
  entityId: string;
  payload: unknown;
};

export type SaveHead = Omit<GameState, ListKey> & {
  order: Record<ListKey, string[]>;
};

export type SlotRecord = {
  id: string;
  slot: number;
  saveVersion: number;
  savedAt: string;
  head: SaveHead;
  chunks: Chunk[];
  cash: number;
  roster: number;
  agencyName: string;
  era: string;
  year: number;
  week: number;
  name: string;
};

export class SaveConflictError extends Error {
  readonly kind = "conflict" as const;
  constructor(message = "This slot was updated in another tab. Reload before you continue.") {
    super(message);
    this.name = "SaveConflictError";
  }
}

export function savedLabel(savedAt: string, now: number): string {
  const delta = Math.max(0, now - new Date(savedAt).getTime());
  if (Number.isNaN(delta) || delta < 45_000) return "Saved just now";
  const mins = Math.round(delta / 60_000);
  if (mins < 60) return `Saved ${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `Saved ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Saved ${days} day${days === 1 ? "" : "s"} ago`;
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function rosterCount(state: GameState): number {
  return state.clients.filter((client) => client.agency === "player" && client.contract).length;
}

function entityId(kind: ListKey, item: unknown): string {
  if (kind === "clients") return String((item as { personId: number }).personId);
  return String((item as { id: string }).id);
}

export function chunkKey(chunk: Pick<Chunk, "kind" | "entityId">): string {
  return `${chunk.kind}:${chunk.entityId}`;
}

export function splitState(state: GameState): { head: SaveHead; chunks: Chunk[] } {
  const chunks: Chunk[] = [];
  const order = {} as Record<ListKey, string[]>;
  const rest = { ...state } as GameState;
  for (const kind of LIST_KEYS) {
    const list = state[kind] as unknown[];
    order[kind] = [];
    for (const item of list) {
      const id = entityId(kind, item);
      order[kind].push(id);
      chunks.push({ kind, entityId: id, payload: item });
    }
    delete rest[kind];
  }
  return { head: { ...(rest as Omit<GameState, ListKey>), order }, chunks };
}

export function joinState(head: SaveHead, chunks: Chunk[]): GameState {
  const { order, ...rest } = head;
  const grouped = new Map<ListKey, Map<string, unknown>>();
  for (const chunk of chunks) {
    let bucket = grouped.get(chunk.kind);
    if (!bucket) {
      bucket = new Map();
      grouped.set(chunk.kind, bucket);
    }
    bucket.set(chunk.entityId, chunk.payload);
  }
  const lists = {} as Pick<GameState, ListKey>;
  for (const kind of LIST_KEYS) {
    const bucket = grouped.get(kind) ?? new Map<string, unknown>();
    const ids = order?.[kind] ?? [...bucket.keys()];
    const seen = new Set<string>();
    const items: unknown[] = [];
    for (const id of ids) {
      if (!bucket.has(id) || seen.has(id)) continue;
      items.push(bucket.get(id));
      seen.add(id);
    }
    for (const [id, payload] of bucket) {
      if (seen.has(id)) continue;
      items.push(payload);
    }
    (lists as Record<ListKey, unknown[]>)[kind] = items;
  }
  return parseState({ ...rest, ...lists });
}

export function diffChunks(before: Chunk[], after: Chunk[]): { upserts: Chunk[]; deletes: { kind: ListKey; entityId: string }[] } {
  const previous = new Map(before.map((chunk) => [chunkKey(chunk), stableStringify(chunk.payload)]));
  const upserts: Chunk[] = [];
  const seen = new Set<string>();
  for (const chunk of after) {
    const key = chunkKey(chunk);
    seen.add(key);
    if (previous.get(key) !== stableStringify(chunk.payload)) upserts.push(chunk);
  }
  const deletes: { kind: ListKey; entityId: string }[] = [];
  for (const chunk of before) {
    if (!seen.has(chunkKey(chunk))) deletes.push({ kind: chunk.kind, entityId: chunk.entityId });
  }
  return { upserts, deletes };
}

export function recordFromState(id: string, slot: number, state: GameState, savedAt: string): SlotRecord {
  const split = splitState(state);
  return {
    id,
    slot,
    saveVersion: 1,
    savedAt,
    head: split.head,
    chunks: split.chunks,
    cash: Math.round(state.agency.cash),
    roster: rosterCount(state),
    agencyName: state.agency.name,
    era: state.era,
    year: state.date.year,
    week: state.date.week,
    name: state.agency.name,
  };
}

export function planCommit(record: SlotRecord, expectedVersion: number, state: GameState, savedAt: string): {
  record: SlotRecord;
  upserts: Chunk[];
  deletes: { kind: ListKey; entityId: string }[];
} {
  if (record.saveVersion !== expectedVersion) throw new SaveConflictError();
  const split = splitState(state);
  const diff = diffChunks(record.chunks, split.chunks);
  const drop = new Set(diff.deletes.map((item) => `${item.kind}:${item.entityId}`));
  const merged = new Map<string, Chunk>();
  for (const chunk of record.chunks) {
    const key = chunkKey(chunk);
    if (!drop.has(key)) merged.set(key, chunk);
  }
  for (const chunk of diff.upserts) merged.set(chunkKey(chunk), chunk);
  return {
    upserts: diff.upserts,
    deletes: diff.deletes,
    record: {
      ...record,
      chunks: [...merged.values()],
      head: split.head,
      saveVersion: record.saveVersion + 1,
      savedAt,
      cash: Math.round(state.agency.cash),
      roster: rosterCount(state),
      agencyName: state.agency.name,
      era: state.era,
      year: state.date.year,
      week: state.date.week,
      name: state.agency.name,
    },
  };
}

export function applyRecord(target: SlotRecord, next: SlotRecord): void {
  target.chunks = next.chunks;
  target.head = next.head;
  target.saveVersion = next.saveVersion;
  target.savedAt = next.savedAt;
  target.cash = next.cash;
  target.roster = next.roster;
  target.agencyName = next.agencyName;
  target.era = next.era;
  target.year = next.year;
  target.week = next.week;
  target.name = next.name;
}

export function runTransaction<T>(record: SlotRecord, fn: () => T): T {
  const snap = structuredClone(record);
  try {
    return fn();
  } catch (error) {
    applyRecord(record, snap);
    throw error;
  }
}

export function statesMatch(left: GameState, right: GameState): boolean {
  return stableStringify(left) === stableStringify(right);
}
