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
  abandonProduction,
  attachCast,
  attachDirector,
  chooseConcept,
  chooseDistribution,
  developProduction,
  financeProduction,
  sellLibrary,
  setMarketing,
  takeEmergencyLoan,
  openDecisions,
  buyUpgrade,
  raiseOfficeTier,
  relocateAgency,
  openSatellite,
  hireAgent,
  setAgent,
  raiseAgent,
  fireAgent,
  assignAgent,
  hirePublicist,
  assignPublicist,
  launchCampaign,
  hireExecutive,
  setExecLimits,
  pitchTalk,
  resolveTalk,
  dismissWhatsNew,
  type Era,
  type GameState,
  type StaffRole,
  type PublicistKind,
  type ExecRole,
  type CampaignKind,
  type Autonomy,
  type AgentTierName,
} from "@/engine";
import { loadCatalog } from "@/lib/catalog";
import { weeksUntilNextEvent, formatDate, markInformationalRead } from "@/engine";
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
  if (!result.message) redirect(dest);
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
    state = createGame({ agencyName: name, era, seed: Math.floor(Math.random() * 1_000_000_000) + 1, catalog, cityId: String(formData.get("city") || "los-angeles") });
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
  if (loaded.state.gameOver) redirect(withParams("/finance", { error: "The agency is closed." }));
  const decisions = openDecisions(loaded.state);
  if (decisions.length > 0) redirect(withParams("/dashboard", { error: `${decisions.length} decisions to make this week.` }));
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
      ? result.message
      : `Advanced ${result.stepped} week${result.stepped === 1 ? "" : "s"} to ${formatDate(result.state.date)}.`;
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
    markInformationalRead(state);
    return { state, ok: true, message: "Notes marked read." };
  });
}

export async function saveNowAction(formData: FormData) {
  const back = String(formData.get("back") || "/dashboard");
  await withSave(back, formData, (state) => {
    state.lastAutosave = { ...state.date };
    return { state, ok: true, message: "" };
  });
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

export async function developAction(formData: FormData) {
  const genre = String(formData.get("genre") || "Drama");
  const tier = String(formData.get("tier") || "micro-indie") as "micro-indie";
  const shootInWeeks = Number(formData.get("shootInWeeks") || 10);
  const shootWeeks = Number(formData.get("shootWeeks") || 5);
  await withSave("/productions/new", formData, (state) => developProduction(state, genre, tier, shootInWeeks, shootWeeks));
}

export async function conceptAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const index = Number(formData.get("index") || 0);
  await withSave(`/productions/${id}`, formData, (state) => chooseConcept(state, id, index));
}

export async function abandonAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await withSave(`/productions/${id}`, formData, (state) => abandonProduction(state, id));
}

export async function directorAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const directorId = Number(formData.get("directorId"));
  const catalog = await loadCatalog();
  await withSave(`/productions/${id}`, formData, (state) => attachDirector(state, catalog, id, directorId));
}

export async function castAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const personId = Number(formData.get("personId"));
  const role = String(formData.get("role") || "Lead") as "Lead";
  const fee = Number(formData.get("fee") || 0);
  const catalog = await loadCatalog();
  await withSave(`/productions/${id}`, formData, (state) => attachCast(state, catalog, id, personId, role, fee));
}

export async function financeAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const plan = String(formData.get("plan") || "cash") as "cash";
  await withSave(`/productions/${id}`, formData, (state) => financeProduction(state, id, plan));
}

export async function marketingAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const amount = Number(formData.get("amount") || 0);
  await withSave(`/productions/${id}`, formData, (state) => setMarketing(state, id, amount));
}

export async function distributeAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const mode = String(formData.get("mode") || "theatrical") === "sale" ? "sale" : "theatrical";
  await withSave(`/productions/${id}`, formData, (state) => chooseDistribution(state, id, mode));
}

export async function libraryAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await withSave("/finance", formData, (state) => sellLibrary(state, id));
}

export async function emergencyLoanAction(formData: FormData) {
  await withSave("/finance", formData, (state) => takeEmergencyLoan(state));
}

export async function upgradeAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const satellite = String(formData.get("satellite") || "");
  await withSave("/office", formData, (state) => ({ state, ...buyUpgrade(state, id, satellite || undefined) }));
}

export async function officeTierAction(formData: FormData) {
  await withSave("/office", formData, (state) => ({ state, ...raiseOfficeTier(state) }));
}

export async function relocateAction(formData: FormData) {
  const cityId = String(formData.get("cityId") || "");
  await withSave("/office", formData, (state) => ({ state, ...relocateAgency(state, cityId) }));
}

export async function satelliteAction(formData: FormData) {
  const cityId = String(formData.get("cityId") || "");
  await withSave("/office", formData, (state) => ({ state, ...openSatellite(state, cityId) }));
}

export async function hireAgentAction(formData: FormData) {
  await withSave("/agents", formData, (state) => ({ state, ...hireAgent(state) }));
}

export async function agentSettingsAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const autonomy = String(formData.get("autonomy") || "") as Autonomy;
  const tier = String(formData.get("tier") || "") as AgentTierName;
  const feeThreshold = Number(formData.get("feeThreshold") || 0);
  await withSave("/agents", formData, (state) => ({ state, ...setAgent(state, id, { autonomy: autonomy || undefined, tier: tier || undefined, feeThreshold: feeThreshold || undefined }) }));
}

export async function raiseAgentAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await withSave("/agents", formData, (state) => ({ state, ...raiseAgent(state, id) }));
}

export async function fireAgentAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await withSave("/agents", formData, (state) => ({ state, ...fireAgent(state, id) }));
}

export async function assignAgentAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  const agentId = String(formData.get("agentId") || "");
  const back = String(formData.get("back") || "/agents");
  await withSave(back, formData, (state) => ({ state, ...assignAgent(state, personId, agentId) }));
}

export async function hirePublicistAction(formData: FormData) {
  const kind = String(formData.get("kind") || "General") as PublicistKind;
  await withSave("/publicists", formData, (state) => ({ state, ...hirePublicist(state, kind) }));
}

export async function assignPublicistAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const personId = Number(formData.get("personId") || 0);
  await withSave("/publicists", formData, (state) => ({ state, ...assignPublicist(state, id, personId || null) }));
}

export async function publicityAction(formData: FormData) {
  const kind = String(formData.get("kind") || "press") as CampaignKind;
  const personId = Number(formData.get("personId"));
  const projectId = String(formData.get("projectId") || "");
  await withSave("/publicists", formData, (state) => ({ state, ...launchCampaign(state, kind, personId, projectId || undefined) }));
}

export async function hireExecAction(formData: FormData) {
  const role = String(formData.get("role") || "CFO") as ExecRole;
  await withSave("/executives", formData, (state) => ({ state, ...hireExecutive(state, role) }));
}

export async function execLimitsAction(formData: FormData) {
  const budget = Number(formData.get("budget") || 0);
  const risk = Number(formData.get("risk") || 40);
  await withSave("/executives", formData, (state) => {
    setExecLimits(state, budget, risk);
    return { state, ok: true, message: "Delegation limits updated." };
  });
}

export async function talkPitchAction(formData: FormData) {
  const personId = Number(formData.get("personId"));
  const showId = String(formData.get("showId") || "");
  const projectId = String(formData.get("projectId") || "");
  await withSave("/talk", formData, (state) => ({ state, ...pitchTalk(state, personId, showId, projectId || undefined) }));
}

export async function talkResolveAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const accept = formData.get("accept") === "yes";
  await withSave("/talk", formData, (state) => ({ state, ...resolveTalk(state, id, accept) }));
}

export async function whatsNewAction(formData: FormData) {
  await withSave("/dashboard", formData, (state) => {
    dismissWhatsNew(state);
    return { state, ok: true, message: "" };
  });
}
