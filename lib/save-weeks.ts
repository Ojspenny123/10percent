import { advanceWeeks } from "@/engine/turn";
import type { AdvanceOptions, Catalog, GameState } from "@/engine";
import { SaveConflictError } from "@/lib/save-diff";

export class PartialSaveError extends Error {
  readonly stepped: number;
  readonly kind: "conflict" | "failed";
  constructor(stepped: number, cause: unknown) {
    const conflict = cause instanceof SaveConflictError;
    const base = conflict
      ? cause.message
      : stepped > 0
        ? `Save failed after ${stepped} saved week${stepped === 1 ? "" : "s"}. The unfinished week was rolled back.`
        : "Save failed. The unfinished week was rolled back.";
    const extra = conflict && stepped > 0
      ? ` ${stepped} earlier week${stepped === 1 ? " was" : "s were"} saved.`
      : "";
    super(`${base}${extra}`);
    this.name = "PartialSaveError";
    this.stepped = stepped;
    this.kind = conflict ? "conflict" : "failed";
  }
}

export async function saveEachWeek(input: {
  state: GameState;
  version: number;
  weeks: number;
  catalog: Catalog;
  stopOnEvent?: boolean;
  commit: (expectedVersion: number, state: GameState) => Promise<{ saveVersion: number }>;
  advance?: (state: GameState) => { state: GameState; message: string };
}): Promise<{ state: GameState; version: number; stepped: number; message: string }> {
  const advance = input.advance ?? ((state: GameState) => advanceWeeks(state, input.catalog, 1, {
    stopOnEvent: input.stopOnEvent,
    autoResolveEvents: false,
  } satisfies AdvanceOptions));
  let state = input.state;
  let version = input.version;
  let stepped = 0;
  let message = "";
  const max = Math.max(1, Math.min(52, Math.round(input.weeks)));
  for (let i = 0; i < max; i++) {
    const advanced = advance(state);
    try {
      const saved = await input.commit(version, advanced.state);
      version = saved.saveVersion;
      state = advanced.state;
      stepped += 1;
      message = advanced.message;
    } catch (error) {
      throw new PartialSaveError(stepped, error);
    }
    if (message.startsWith("Paused")) break;
  }
  return { state, version, stepped, message };
}
