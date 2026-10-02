"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  acceptOffer,
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
import { weeksUntilNextEvent, formatDate } from "@/engine";
import { SLOT_COOKIE, slotCookieOptions } from "@/lib/game";
import { commitSlot, copySlot, deleteSlot, loadSlot, writeNewGame } from "@/lib/persist";
import { SaveConflictError } from "@/lib/save-diff";
import { PartialSaveError, saveEachWeek } from "@/lib/save-weeks";

function withParams(path: string, params: Record<string, string>) {
  const url = new URL(path, "http://tenpercent.local");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function readVersion(formData: FormData): number {
  const value = Number(formData.get("version"));
  if (!Number.isInteger(value) || value < 1) throw new SaveConflictError("Reload the page, then try again.");
  return value;
}

async function requireSlot(expected: number) {
  const jar = await cookies();
  const id = jar.get(SLOT_COOKIE)?.value;
  if (!id) redirect("/");
  const loaded = await loadSlot(id);
  if (!loaded) redirect("/");
  if (loaded.saveVersion !== expected) throw new SaveConflictError();
  return loaded;
}

function saveFailurePath(path: string, error: unknown) {
  if (error instanceof PartialSaveError) return withParams(path, { saveError: error.message, saveKind: error.kind });
  if (error instanceof SaveConflictError) return withParams(path, { saveError: error.message, saveKind: "conflict" });
  const message = error instanceof Error ? error.message : "Save failed. The unfinished change was rolled back.";
  return withParams(path, { saveError: message, saveKind: "failed" });
}

async function withSave(path: string, formData: FormData, run: (state: GameState) => Promise<{ state: GameState; ok: boolean; message: string; warning?: string; href?: string }> | { state: GameState; ok: boolean; message: string; warning?: string; href?: string }) {
  let expected: number;
  try {
    expected = readVersion(formData);
  } catch (error) {
    if (!(error instanceof SaveConflictError)) throw error;
    redirect(saveFailurePath(path, error));
  }
  let loaded;
  try {
    loaded = await requireSlot(expected);
  } catch (error) {
    if (!(error instanceof SaveConflictError)) throw error;
    redirect(saveFailurePath(path, error));
  }
  const result = await run(loaded.state);
  const dest = result.href || path;
  if (result.warning) redirect(withParams(dest, { warn: result.warning }));
  try {
    await commitSlot(loaded.id, loaded.saveVersion, result.state);
  } catch (error) {
    redirect(saveFailurePath(dest, error));
  }
  revalidatePath("/", "layout");
  const key = result.ok ? "notice" : "error";
  redirect(withParams(dest, { [key]: result.message }));
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
  let saved: { id: string };
  try {
    saved = await writeNewGame(slot, state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the new agency.";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }
  const jar = await cookies();
  jar.set(SLOT_COOKIE, saved.id, slotCookieOptions());
  redirect("/dashboard");
}

export async function loadSlotAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const loaded = await loadSlot(id);
  if (!loaded) redirect("/?error=That%20save%20is%20gone.");
  const jar = await cookies();
  jar.set(SLOT_COOKIE, loaded.id, slotCookieOptions());
  redirect("/dashboard");
}

export async function advanceAction(formData: FormData) {
  let expected: number;
  try {
    expected = readVersion(formData);
  } catch (error) {
    if (!(error instanceof SaveConflictError)) throw error;
    redirect(saveFailurePath("/dashboard", error));
  }
  let loaded;
  try {
    loaded = await requireSlot(expected);
  } catch (error) {
    if (!(error instanceof SaveConflictError)) throw error;
    redirect(saveFailurePath("/dashboard", error));
  }
  const mode = String(formData.get("mode") || "week");
  const catalog = await loadCatalog();
  const weeks = mode === "month" ? 4 : mode === "event" ? weeksUntilNextEvent(loaded.state) : 1;
  try {
    const result = await saveEachWeek({
      state: loaded.state,
      version: loaded.saveVersion,
      weeks,
      catalog,
      stopOnEvent: true,
      commit: (version, state) => commitSlot(loaded.id, version, state),
    });
    revalidatePath("/", "layout");
    const message = result.message.startsWith("Paused")
      ? `${result.message} Saved.`
      : `Advanced ${result.stepped} week${result.stepped === 1 ? "" : "s"} to ${formatDate(result.state.date)}. Saved.`;
    redirect(withParams("/dashboard", { notice: message }));
  } catch (error) {
    if (!(error instanceof PartialSaveError)) throw error;
    revalidatePath("/", "layout");
    redirect(saveFailurePath("/dashboard", error));
  }
}

export async function signAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  const commission = Number(formData.get("commission") || 10);
  const years = Number(formData.get("years") || 2);
  const exclusive = formData.get("exclusive") === "on" || formData.get("exclusive") === "yes";
  const exitClause = formData.get("exitClause") === "on" || formData.get("exitClause") === "yes";
  const back = String(formData.get("back") || "/talent");
  const catalog = await loadCatalog();
  await withSave(back, formData, (state) => signClient(state, catalog, personId, { commission, years, exclusive, exitClause }));
}

export async function renewAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  const commission = Number(formData.get("commission") || 10);
  const years = Number(formData.get("years") || 2);
  const exclusive = formData.get("exclusive") === "on" || formData.get("exclusive") === "yes";
  const exitClause = formData.get("exitClause") === "on" || formData.get("exitClause") === "yes";
  await withSave(`/actors/${personId}?tab=contract`, formData, (state) => renewContract(state, personId, { commission, years, exclusive, exitClause }));
}

export async function releaseAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  await withSave("/roster", formData, (state) => releaseClient(state, personId));
}

export async function meetingAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const intent = String(formData.get("intent") || "decline");
  const action = intent === "accept" || intent === "counter" ? intent : "decline";
  const catalog = await loadCatalog();
  const terms = {
    commission: Number(formData.get("commission") || 10),
    termYears: Number(formData.get("years") || 2),
    exclusive: formData.get("exclusive") === "yes",
    exitClause: formData.get("exitClause") === "yes",
  };
  await withSave(`/meetings/${id}`, formData, (state) => respondApproach(state, catalog, id, action, terms));
}

export async function acceptOfferAction(formData: FormData) {
  const id = String(formData.get("offerId") || "");
  const confirm = formData.get("confirm") === "yes";
  await withSave(`/offers?offer=${id}`, formData, (state) => acceptOffer(state, id, confirm));
}

export async function declineOfferAction(formData: FormData) {
  const id = String(formData.get("offerId") || "");
  await withSave("/offers", formData, (state) => declineOffer(state, id));
}

export async function counterOfferAction(formData: FormData) {
  const id = String(formData.get("offerId") || "");
  const confirm = formData.get("confirm") === "yes";
  const fee = Number(formData.get("fee"));
  const billing = Number(formData.get("billing"));
  const backend = Number(formData.get("backend"));
  const dateShiftWeeks = Number(formData.get("dateShift") || 0);
  const perk = String(formData.get("perk") || "") || null;
  await withSave(`/offers?offer=${id}`, formData, (state) => counterOffer(state, id, { fee, billing, backend, dateShiftWeeks, perk }, confirm));
}

export async function eventAction(formData: FormData) {
  const id = String(formData.get("eventId") || "");
  const choice = String(formData.get("choice") || "");
  await withSave("/dashboard", formData, (state) => resolveEvent(state, id, choice));
}

export async function staffAction(formData: FormData) {
  const role = String(formData.get("role") || "") as StaffRole;
  await withSave("/agency", formData, (state) => hireOrUpgrade(state, role));
}

export async function brandAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const accept = formData.get("accept") === "yes";
  await withSave("/agency", formData, (state) => resolveBrand(state, id, accept));
}

export async function campaignAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const amount = Number(formData.get("amount") || 0);
  await withSave(`/projects/${projectId}`, formData, (state) => fundCampaign(state, projectId, amount));
}

export async function festivalAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const festivalId = String(formData.get("festivalId") || "");
  const festival = String(formData.get("festival") || "");
  const week = Number(formData.get("week") || 1);
  await withSave(`/projects/${projectId}`, formData, (state) => submitFestival(state, projectId, festivalId, festival, week));
}

export async function readInboxAction(formData: FormData) {
  await withSave("/dashboard", formData, (state) => {
    for (const item of state.inbox) item.read = true;
    return { state, ok: true, message: "Inbox marked read." };
  });
}

export async function saveNowAction(formData: FormData) {
  const back = String(formData.get("back") || "/dashboard");
  await withSave(back, formData, (state) => ({ state, ok: true, message: "Saved." }));
}

export async function saveAsAction(formData: FormData) {
  let expected: number;
  try {
    expected = readVersion(formData);
  } catch (error) {
    if (!(error instanceof SaveConflictError)) throw error;
    redirect(saveFailurePath("/game", error));
  }
  let loaded;
  try {
    loaded = await requireSlot(expected);
  } catch (error) {
    if (!(error instanceof SaveConflictError)) throw error;
    redirect(saveFailurePath("/game", error));
  }
  let copy: { id: string; slot: number };
  try {
    copy = await copySlot(loaded.id, loaded.saveVersion);
  } catch (error) {
    if (error instanceof SaveConflictError) redirect(saveFailurePath("/game", error));
    const message = error instanceof Error ? error.message : "Could not save a new slot.";
    redirect(withParams("/game", { saveError: message, saveKind: "failed" }));
  }
  const jar = await cookies();
  jar.set(SLOT_COOKIE, copy.id, slotCookieOptions());
  revalidatePath("/", "layout");
  redirect(withParams("/dashboard", { notice: `Saved as slot ${copy.slot}. Autosave will use that slot.` }));
}

export async function deleteSlotAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const jar = await cookies();
  const active = jar.get(SLOT_COOKIE)?.value;
  try {
    await deleteSlot(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "That slot could not be deleted.";
    redirect(withParams("/game", { saveError: message, saveKind: "failed" }));
  }
  revalidatePath("/", "layout");
  if (active === id) {
    jar.delete(SLOT_COOKIE);
    redirect("/?notice=Slot%20deleted.");
  }
  redirect("/game?notice=Slot%20deleted.");
}
