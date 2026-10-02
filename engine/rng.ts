export type RngState = { s: number };

export function makeRng(seed: number): RngState {
  const s = seed >>> 0;
  return { s: s === 0 ? 1 : s };
}

/** mulberry32 step. Returns a float in [0, 1). Mutates state so saves stay reproducible. */
export function next(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function int(rng: RngState, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(next(rng) * (max - min + 1));
}

export function float(rng: RngState, min: number, max: number): number {
  return min + next(rng) * (max - min);
}

export function chance(rng: RngState, p: number): boolean {
  return next(rng) < p;
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty list");
  }
  return items[Math.floor(next(rng) * items.length)]!;
}

export function weightedPick<T>(rng: RngState, items: readonly T[], weights: readonly number[]): T {
  if (items.length === 0) throw new Error("Cannot pick from an empty list");
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return pick(rng, items);
  let roll = next(rng) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= Math.max(0, weights[i] ?? 0);
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function shuffle<T>(rng: RngState, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next(rng) * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export function id(rng: RngState, prefix: string): string {
  return `${prefix}_${Math.floor(next(rng) * 1e9).toString(36)}`;
}
