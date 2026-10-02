import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import type { GameState } from "@/engine/types";
import { prisma } from "@/lib/prisma";

export const SLOT_COOKIE = "tenpercent_slot";

export function parseState(value: unknown): GameState {
  if (!value || typeof value !== "object") throw new Error("This save could not be read.");
  const state = value as GameState;
  if (!state.agency || !state.date || !state.rng || !Array.isArray(state.projects) || !Array.isArray(state.clients)) {
    throw new Error("This save is missing its agency.");
  }
  state.holds ??= [];
  state.brandDeals ??= [];
  state.festivals ??= [];
  state.ceremoniesRun ??= [];
  state.approaches ??= [];
  state.events ??= [];
  state.inbox ??= [];
  state.news ??= [];
  state.awards ??= [];
  state.ledger ??= [];
  state.rivals ??= [];
  for (const project of state.projects) {
    project.commissionsPaid ??= [];
    project.reviews ??= [];
    project.weeklyGross ??= [];
    project.seasons ??= [];
    project.cast ??= [];
  }
  return state;
}

export async function readSlot(): Promise<{ id: string; slot: number; state: GameState } | null> {
  const jar = await cookies();
  const id = jar.get(SLOT_COOKIE)?.value;
  if (!id) return null;
  const row = await prisma.saveSlot.findUnique({ where: { id } });
  if (!row) return null;
  return { id: row.id, slot: row.slot, state: parseState(row.state) };
}

export async function writeState(id: string, state: GameState): Promise<void> {
  await prisma.saveSlot.update({
    where: { id },
    data: {
      state: state as unknown as Prisma.InputJsonValue,
      year: state.date.year,
      week: state.date.week,
      agencyName: state.agency.name,
      era: state.era,
      name: state.agency.name,
    },
  });
}

export async function listSlots() {
  return prisma.saveSlot.findMany({ orderBy: { slot: "asc" } });
}
