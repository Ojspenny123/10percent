"use server";

import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  acceptOffer,
  advanceUntilEvent,
  advanceWeeks,
  counterOffer,
  createGame,
  declineOffer,
  fundCampaign,
  hireOrUpgrade,
  releaseClient,
  renewContract,
  resolveBrand,
  resolveEvent,
  respondApproach,
  signClient,
  submitFestival,
  type Era,
  type GameState,
  type StaffRole,
} from "@/engine";
import { loadCatalog } from "@/lib/catalog";
import { SLOT_COOKIE, parseState, writeState } from "@/lib/game";
import { prisma } from "@/lib/prisma";

async function withSave(path: string, run: (state: GameState) => Promise<{ state: GameState; ok: boolean; message: string; warning?: string }> | { state: GameState; ok: boolean; message: string; warning?: string }) {
  const jar = await cookies();
  const id = jar.get(SLOT_COOKIE)?.value;
  if (!id) redirect("/");
  const row = await prisma.saveSlot.findUnique({ where: { id } });
  if (!row) redirect("/");
  const current = parseState(row.state);
  const result = await run(current);
  if (result.warning) {
    const join = path.includes("?") ? "&" : "?";
    redirect(`${path}${join}warn=${encodeURIComponent(result.warning)}`);
  }
  await writeState(id, result.state);
  revalidatePath("/", "layout");
  const join = path.includes("?") ? "&" : "?";
  const key = result.ok ? "notice" : "error";
  redirect(`${path}${join}${key}=${encodeURIComponent(result.message)}`);
}

export async function createGameAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const era = String(formData.get("era") || "today") as Era;
  const slot = Number(formData.get("slot") || 1);
  if (!["1990s", "2000s", "today"].includes(era)) redirect("/?error=Pick%20a%20start%20era.");
  if (slot < 1 || slot > 5) redirect("/?error=Pick%20a%20save%20slot.");
  const catalog = await loadCatalog();
  let state: GameState;
  try {
    state = createGame({ agencyName: name, era, seed: Math.floor(Math.random() * 1_000_000_000) + 1, catalog });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start a game.";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }
  const saved = await prisma.saveSlot.upsert({
    where: { slot },
    create: {
      slot,
      name: state.agency.name,
      agencyName: state.agency.name,
      era: state.era,
      year: state.date.year,
      week: state.date.week,
      state: state as unknown as Prisma.InputJsonValue,
    },
    update: {
      name: state.agency.name,
      agencyName: state.agency.name,
      era: state.era,
      year: state.date.year,
      week: state.date.week,
      state: state as unknown as Prisma.InputJsonValue,
    },
  });
  const jar = await cookies();
  jar.set(SLOT_COOKIE, saved.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}

export async function loadSlotAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const row = await prisma.saveSlot.findUnique({ where: { id } });
  if (!row) redirect("/?error=That%20save%20is%20gone.");
  const jar = await cookies();
  jar.set(SLOT_COOKIE, row.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}

export async function advanceAction(formData: FormData) {
  const mode = String(formData.get("mode") || "week");
  const catalog = await loadCatalog();
  await withSave("/dashboard", (state) => {
    const result = mode === "month"
      ? advanceWeeks(state, catalog, 4, { stopOnEvent: true })
      : mode === "event"
        ? advanceUntilEvent(state, catalog)
        : advanceWeeks(state, catalog, 1, { stopOnEvent: true });
    return { ...result, ok: true };
  });
}

export async function signAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  const commission = Number(formData.get("commission") || 10);
  const years = Number(formData.get("years") || 2);
  const exclusive = formData.get("exclusive") === "on" || formData.get("exclusive") === "yes";
  const exitClause = formData.get("exitClause") === "on" || formData.get("exitClause") === "yes";
  const back = String(formData.get("back") || "/talent");
  const catalog = await loadCatalog();
  await withSave(back, (state) => signClient(state, catalog, personId, { commission, years, exclusive, exitClause }));
}

export async function renewAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  const commission = Number(formData.get("commission") || 10);
  const years = Number(formData.get("years") || 2);
  const exclusive = formData.get("exclusive") === "on" || formData.get("exclusive") === "yes";
  const exitClause = formData.get("exitClause") === "on" || formData.get("exitClause") === "yes";
  await withSave(`/actors/${personId}?tab=contract`, (state) => renewContract(state, personId, { commission, years, exclusive, exitClause }));
}

export async function releaseAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  await withSave("/roster", (state) => releaseClient(state, personId));
}

export async function approachAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const accept = formData.get("accept") === "yes";
  const commission = formData.get("commission") ? Number(formData.get("commission")) : undefined;
  const catalog = await loadCatalog();
  await withSave("/dashboard", (state) => respondApproach(state, catalog, id, accept, commission));
}

export async function acceptOfferAction(formData: FormData) {
  const id = String(formData.get("offerId") || "");
  const confirm = formData.get("confirm") === "yes";
  await withSave(`/offers?offer=${id}`, (state) => acceptOffer(state, id, confirm));
}

export async function declineOfferAction(formData: FormData) {
  const id = String(formData.get("offerId") || "");
  await withSave("/offers", (state) => declineOffer(state, id));
}

export async function counterOfferAction(formData: FormData) {
  const id = String(formData.get("offerId") || "");
  const confirm = formData.get("confirm") === "yes";
  const fee = Number(formData.get("fee"));
  const billing = Number(formData.get("billing"));
  const backend = Number(formData.get("backend"));
  const dateShiftWeeks = Number(formData.get("dateShift") || 0);
  const perk = String(formData.get("perk") || "") || null;
  await withSave(`/offers?offer=${id}`, (state) => counterOffer(state, id, { fee, billing, backend, dateShiftWeeks, perk }, confirm));
}

export async function eventAction(formData: FormData) {
  const id = String(formData.get("eventId") || "");
  const choice = String(formData.get("choice") || "");
  await withSave("/dashboard", (state) => resolveEvent(state, id, choice));
}

export async function staffAction(formData: FormData) {
  const role = String(formData.get("role") || "") as StaffRole;
  await withSave("/agency", (state) => hireOrUpgrade(state, role));
}

export async function brandAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const accept = formData.get("accept") === "yes";
  await withSave("/agency", (state) => resolveBrand(state, id, accept));
}

export async function campaignAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const amount = Number(formData.get("amount") || 0);
  await withSave(`/projects/${projectId}`, (state) => fundCampaign(state, projectId, amount));
}

export async function festivalAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const festivalId = String(formData.get("festivalId") || "");
  const festival = String(formData.get("festival") || "");
  const week = Number(formData.get("week") || 1);
  await withSave(`/projects/${projectId}`, (state) => submitFestival(state, projectId, festivalId, festival, week));
}

export async function readInboxAction() {
  await withSave("/dashboard", (state) => {
    for (const item of state.inbox) item.read = true;
    return { state, ok: true, message: "Inbox marked read." };
  });
}
