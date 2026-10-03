import { GENRES } from "./constants";
import { sideRng } from "./career";
import { nextId } from "./generate";
import { book } from "./actions";
import { CITIES, cityById, keepBigOffer, type CityInfo } from "./places";
import { ensureRivalField, sameCountry, tickRivals } from "./rivals";
import { clientFromCatalog } from "./people";
import { chance, next, pick } from "./rng";
import { addWeeks, cmpDate, scheduleConflict, shootEnd } from "./schedule";
import type {
  Agency,
  Campaign,
  CampaignKind,
  Catalog,
  Client,
  ExecRole,
  Executive,
  FirmAgent,
  GameState,
  Offer,
  OfficeTier,
  Publicist,
  PublicistKind,
  TalkInvite,
} from "./types";

const NAMES_A = ["Maya", "Jonah", "Priya", "Elena", "Chris", "Amina", "Leo", "Sofia", "Noah", "Hana", "Ibrahim", "Grace", "Omar", "Lucia", "Felix", "Nora", "Samir", "Chloe", "Evan", "Yara"];
const NAMES_B = ["Okoye", "Berg", "Sharma", "Costa", "Nguyen", "Adler", "Santos", "Ito", "Walsh", "Mensah", "Park", "Moreau", "Diallo", "Keller", "Rossi", "Abebe", "Duval", "Singh", "Novak", "Clarke"];

export const OFFICE_UPGRADES: {
  id: string;
  name: string;
  group: string;
  cost: number;
  upkeep: number;
  effect: string;
}[] = [
  { id: "meeting_rooms", name: "Meeting rooms", group: "Meetings", cost: 45_000, upkeep: 400, effect: "More negotiations at once, and quotes come in a little hotter." },
  { id: "boardroom", name: "Boardroom", group: "Meetings", cost: 120_000, upkeep: 900, effect: "Studios and executives take the shop more seriously." },
  { id: "screening", name: "Screening room", group: "Commercial", cost: 90_000, upkeep: 700, effect: "Film promotion and awards campaigns land harder." },
  { id: "casting", name: "Casting studio", group: "Commercial", cost: 55_000, upkeep: 450, effect: "More casting-related offers and faster self-tapes." },
  { id: "edit_bay", name: "Edit bay", group: "Commercial", cost: 70_000, upkeep: 500, effect: "Agency productions cost less and overrun less often." },
  { id: "press_room", name: "Press room", group: "Commercial", cost: 40_000, upkeep: 350, effect: "A standing publicity bump for the roster." },
  { id: "lounge", name: "Client lounge", group: "Social", cost: 35_000, upkeep: 300, effect: "Clients linger. Loyalty and inbound calls rise." },
  { id: "terrace", name: "Rooftop terrace", group: "Social", cost: 80_000, upkeep: 450, effect: "Networking nights add a little buzz." },
  { id: "games", name: "Games room", group: "Social", cost: 25_000, upkeep: 200, effect: "A small loyalty bump between jobs." },
  { id: "chef", name: "In-house chef", group: "Social", cost: 60_000, upkeep: 800, effect: "Hospitality keeps people in the building." },
  { id: "club", name: "Club room", group: "Social", cost: 100_000, upkeep: 600, effect: "A members room that attracts approaches." },
  { id: "spa", name: "Wellness room", group: "Care", cost: 50_000, upkeep: 400, effect: "Softer scandal recovery and steadier moods." },
  { id: "gym", name: "Gym", group: "Care", cost: 40_000, upkeep: 300, effect: "Clients show up ready. A small marketability drift." },
  { id: "rehearsal", name: "Coaching studio", group: "Care", cost: 65_000, upkeep: 450, effect: "Talent and range tick up between jobs." },
  { id: "green_room", name: "Green room", group: "Care", cost: 30_000, upkeep: 200, effect: "Talk-show appearances go better." },
  { id: "canteen", name: "Staff canteen", group: "Staff", cost: 28_000, upkeep: 350, effect: "Agents stay longer." },
  { id: "training_room", name: "Training room", group: "Staff", cost: 36_000, upkeep: 250, effect: "Agent skills rise faster." },
  { id: "workspace", name: "Better workspace", group: "Staff", cost: 48_000, upkeep: 300, effect: "Fewer agents quit over the room." },
  { id: "art", name: "Art collection", group: "Prestige", cost: 75_000, upkeep: 150, effect: "A visible reputation bump." },
  { id: "reception", name: "Designed reception", group: "Prestige", cost: 55_000, upkeep: 200, effect: "The first impression is the reputation." },
  { id: "awards_cabinet", name: "Awards cabinet", group: "Prestige", cost: 20_000, upkeep: 50, effect: "A small awards-campaign boost. Trophies go on show." },
  { id: "privacy", name: "Privacy suite", group: "Tech", cost: 85_000, upkeep: 400, effect: "Leaks and scandals hit less often and less hard." },
  { id: "analytics", name: "Analytics room", group: "Tech", cost: 60_000, upkeep: 350, effect: "Offer reads and the cash forecast get sharper." },
  { id: "podcast", name: "Podcast studio", group: "Tech", cost: 42_000, upkeep: 250, effect: "Social reach grows faster." },
  { id: "desks", name: "More desks", group: "Capacity", cost: 32_000, upkeep: 200, effect: "Room to hire more agents and publicists." },
];

const TIER_COST: Record<OfficeTier, number> = { Starter: 0, Standard: 80_000, Premium: 220_000, Flagship: 500_000 };
const TIER_RENT: Record<OfficeTier, number> = { Starter: 1, Standard: 1.35, Premium: 1.8, Flagship: 2.4 };
const NEXT_TIER: Record<OfficeTier, OfficeTier | null> = { Starter: "Standard", Standard: "Premium", Premium: "Flagship", Flagship: null };

export const TALK_SHOWS: {
  id: string;
  name: string;
  country: "US" | "UK";
  kind: string;
  reach: number;
  prestige: number;
  fame: number;
}[] = [
  { id: "fallon", name: "The Tonight Show Starring Jimmy Fallon", country: "US", kind: "Late night", reach: 90, prestige: 86, fame: 55 },
  { id: "kimmel", name: "Jimmy Kimmel Live!", country: "US", kind: "Late night", reach: 88, prestige: 84, fame: 55 },
  { id: "meyers", name: "Late Night with Seth Meyers", country: "US", kind: "Late night", reach: 70, prestige: 74, fame: 40 },
  { id: "daily", name: "The Daily Show", country: "US", kind: "Late night", reach: 72, prestige: 78, fame: 35 },
  { id: "drew", name: "The Drew Barrymore Show", country: "US", kind: "Daytime", reach: 66, prestige: 60, fame: 25 },
  { id: "kelly", name: "Live with Kelly and Mark", country: "US", kind: "Daytime", reach: 75, prestige: 62, fame: 30 },
  { id: "gma", name: "Good Morning America", country: "US", kind: "Morning", reach: 92, prestige: 70, fame: 50 },
  { id: "view", name: "The View", country: "US", kind: "Daytime", reach: 80, prestige: 68, fame: 40 },
  { id: "norton", name: "The Graham Norton Show", country: "UK", kind: "Chat", reach: 84, prestige: 90, fame: 60 },
  { id: "ross", name: "The Jonathan Ross Show", country: "UK", kind: "Chat", reach: 60, prestige: 72, fame: 45 },
  { id: "this-morning", name: "This Morning", country: "UK", kind: "Daytime", reach: 70, prestige: 55, fame: 20 },
  { id: "gmb", name: "Good Morning Britain", country: "UK", kind: "Morning", reach: 74, prestige: 58, fame: 25 },
  { id: "one-show", name: "The One Show", country: "UK", kind: "Early evening", reach: 78, prestige: 64, fame: 30 },
  { id: "loose", name: "Loose Women", country: "UK", kind: "Daytime", reach: 62, prestige: 50, fame: 15 },
  { id: "brunch", name: "Sunday Brunch", country: "UK", kind: "Weekend", reach: 55, prestige: 60, fame: 25 },
  { id: "lorraine", name: "Lorraine", country: "UK", kind: "Morning", reach: 58, prestige: 48, fame: 15 },
];

const EXEC_RATES: Record<ExecRole, number> = { CFO: 0.03, COO: 0.03, CCO: 0.04, CMO: 0.02, CPO: 0.015, GC: 0.015 };
const EXEC_SALARY: Record<ExecRole, number> = { CFO: 9000, COO: 8500, CCO: 9500, CMO: 7000, CPO: 6500, GC: 8000 };

export function cityOf(state: GameState): CityInfo {
  return cityById(state.agency.cityId) ?? CITIES[0]!;
}

export function ensureV7(state: GameState, catalog?: Catalog): void {
  state.agency.cityId ??= "los-angeles";
  state.agency.officeTier ??= "Starter";
  state.agency.upgrades ??= [];
  state.agency.satellites ??= [];
  state.agency.relocating ??= null;
  const city = cityOf(state);
  if (!state.agency.rent || state.agency.rent === 12000 && state.agency.cityId !== "los-angeles") {
    state.agency.rent = rentFor(city, state.agency.officeTier ?? "Starter");
  }
  if (state.agency.cityId === "los-angeles" && state.agency.officeTier === "Starter" && state.agency.rent < 12000) {
    state.agency.rent = 12000;
  }
  state.agents ??= [];
  state.publicists ??= [];
  state.campaigns ??= [];
  state.executives ??= [];
  state.execBudget ??= 250_000;
  state.execRisk ??= 40;
  state.talkInvites ??= [];
  state.talkBookings ??= [];
  state.profitYears ??= [];
  state.whatsNewSeen ??= false;
  state.agentNotes ??= [];
  state.execNotes ??= [];
  state.rivalNotes ??= [];
  for (const client of state.clients) backfillPerson(client, catalog);
  ensureRivalField(state, catalog);
}

function backfillPerson(client: Client, catalog?: Catalog): void {
  if (client.directingAptitude == null) {
    let aptitude = 18 + (client.personId * 17) % 50;
    const named = catalog?.directors.some((row) => row.name === client.name);
    if (named) aptitude = Math.min(94, aptitude + 28);
    client.directingAptitude = aptitude;
  }
  client.primaryFocus ??= "Actor";
  client.socialReach ??= Math.round(8 + client.stats.starPower * 0.7 + client.stats.marketability * 0.2);
  client.directingCredits ??= [];
  client.agentId ??= null;
}

export function rentFor(city: CityInfo, tier: OfficeTier): number {
  return Math.round(city.rent * TIER_RENT[tier]);
}

export function homeMarket(nationality: string | null, cityId: string | undefined): "local" | "regional" | "international" {
  const city = cityById(cityId) ?? CITIES[0]!;
  if (sameCountry(nationality, city.country)) return "local";
  const region = city.region;
  if (region === "US" && sameCountry(nationality, "Canada")) return "regional";
  if (region === "UK" && sameCountry(nationality, "Ireland")) return "regional";
  if (region === "Europe" && nationality && /france|germany|spain|italy|ireland|netherlands|sweden|europe/i.test(nationality)) return "regional";
  return "international";
}

export function openDecisions(state: GameState): { id: string; title: string; href: string }[] {
  const rows: { id: string; title: string; href: string }[] = [];
  for (const event of state.events) {
    if (!event.resolved) rows.push({ id: event.id, title: event.title, href: `/dashboard#event-${event.id}` });
  }
  for (const offer of state.offers) {
    if (offer.status !== "pending") continue;
    const client = state.clients.find((row) => row.personId === offer.personId && row.agency === "player");
    if (!client) continue;
    const project = state.projects.find((row) => row.id === offer.projectId);
    rows.push({ id: offer.id, title: `${client.name}: ${project?.title ?? "an offer"}`, href: `/offers?offer=${offer.id}` });
  }
  for (const approach of state.approaches) {
    if (approach.status === "pending") rows.push({ id: approach.id, title: `${approach.name} wants a meeting`, href: `/meetings/${approach.id}` });
  }
  for (const deal of state.brandDeals) {
    if (deal.status === "offered") rows.push({ id: deal.id, title: `${deal.personName}: ${deal.brand}`, href: `/agency#brand-${deal.id}` });
  }
  for (const invite of state.talkInvites ?? []) {
    if (invite.status !== "pending") continue;
    const show = TALK_SHOWS.find((row) => row.id === invite.showId);
    const client = state.clients.find((row) => row.personId === invite.personId);
    rows.push({ id: invite.id, title: `${client?.name ?? "A client"} invited to ${show?.name ?? "a talk show"}`, href: `/talk#invite-${invite.id}` });
  }
  return rows;
}

export function needsAction(state: GameState, item: { kind: string; refId?: string; resolved?: boolean }): boolean {
  if (item.resolved || !item.refId) return false;
  if (item.kind === "event") return state.events.some((row) => row.id === item.refId && !row.resolved);
  if (item.kind === "offer") return state.offers.some((row) => row.id === item.refId && row.status === "pending");
  if (item.kind === "approach") return state.approaches.some((row) => row.id === item.refId && row.status === "pending");
  if (item.kind === "money") return state.brandDeals.some((row) => row.id === item.refId && row.status === "offered");
  return false;
}

export function informationalUnread(state: GameState): number {
  return state.inbox.filter((item) => !item.read && !needsAction(state, item)).length;
}

export function markInformationalRead(state: GameState): void {
  for (const item of state.inbox) {
    if (!needsAction(state, item)) item.read = true;
  }
}

export function staffWeekly(state: GameState): number {
  const agents = (state.agents ?? []).reduce((sum, row) => sum + row.salary, 0);
  const publicists = (state.publicists ?? []).reduce((sum, row) => sum + row.salary, 0);
  const execs = (state.executives ?? []).reduce((sum, row) => sum + row.salary, 0);
  const upkeep = upgradeUpkeep(state.agency);
  const satellites = (state.agency.satellites ?? []).reduce((sum, row) => sum + row.rent / 4, 0);
  return Math.round(agents + publicists + execs + upkeep + satellites);
}

function upgradeUpkeep(agency: Agency): number {
  const ids = new Set([...(agency.upgrades ?? []), ...(agency.satellites ?? []).flatMap((row) => row.upgrades)]);
  let total = 0;
  for (const upgrade of OFFICE_UPGRADES) if (ids.has(upgrade.id)) total += upgrade.upkeep;
  return total;
}

export function hasUpgrade(state: GameState, id: string): boolean {
  if (state.agency.upgrades?.includes(id)) return true;
  return (state.agency.satellites ?? []).some((row) => row.upgrades.includes(id));
}

export function deskCap(state: GameState): number {
  let cap = 3;
  if (hasUpgrade(state, "desks")) cap += 4;
  if (state.agency.officeTier === "Premium") cap += 1;
  if (state.agency.officeTier === "Flagship") cap += 2;
  return cap;
}

export function buyUpgrade(state: GameState, id: string, satellite?: string): { ok: boolean; message: string } {
  const spec = OFFICE_UPGRADES.find((row) => row.id === id);
  if (!spec) return { ok: false, message: "That room is not on the plan." };
  const list = satellite ? state.agency.satellites?.find((row) => row.cityId === satellite)?.upgrades : state.agency.upgrades;
  if (!list) return { ok: false, message: "That office is not open." };
  if (list.includes(id)) return { ok: false, message: "You already have that room." };
  if (state.agency.cash < spec.cost) return { ok: false, message: "Cash does not cover the build." };
  book(state, -spec.cost, `Office · ${spec.name}`, "overhead");
  list.push(id);
  return { ok: true, message: `${spec.name} is in the building.` };
}

export function raiseOfficeTier(state: GameState): { ok: boolean; message: string } {
  const now = state.agency.officeTier ?? "Starter";
  const nextTier = NEXT_TIER[now];
  if (!nextTier) return { ok: false, message: "The office is already a flagship." };
  const cost = TIER_COST[nextTier];
  if (state.agency.cash < cost) return { ok: false, message: "Cash does not cover the refit." };
  book(state, -cost, `Office refit · ${nextTier}`, "overhead");
  state.agency.officeTier = nextTier;
  state.agency.rent = rentFor(cityOf(state), nextTier);
  return { ok: true, message: `The office is now ${nextTier}.` };
}

export function nextOfficeTier(state: GameState): { tier: OfficeTier; cost: number } | null {
  const nextTier = NEXT_TIER[state.agency.officeTier ?? "Starter"];
  if (!nextTier) return null;
  return { tier: nextTier, cost: TIER_COST[nextTier] };
}

export function relocateAgency(state: GameState, cityId: string): { ok: boolean; message: string } {
  const city = cityById(cityId);
  if (!city) return { ok: false, message: "That city is not on the list." };
  if (city.id === state.agency.cityId) return { ok: false, message: "The agency is already there." };
  if (state.agency.relocating) return { ok: false, message: "A move is already underway." };
  const cost = Math.round(180_000 * (city.rent / 12000));
  if (state.agency.cash < cost) return { ok: false, message: "The move costs more than the account holds." };
  book(state, -cost, `Relocation to ${city.city}`, "overhead");
  state.agency.relocating = { cityId: city.id, arrives: addWeeks(state.date, 8) };
  for (const client of state.clients) {
    if (client.agency !== "player") continue;
    client.loyalty = Math.max(1, client.loyalty - 8);
  }
  return { ok: true, message: `Packing for ${city.city}. Clients feel the move. It takes eight weeks.` };
}

export function openSatellite(state: GameState, cityId: string): { ok: boolean; message: string } {
  if (state.agency.tier === "Boutique" || state.agency.tier === "Rising") {
    return { ok: false, message: "Satellite offices unlock at Established." };
  }
  const city = cityById(cityId);
  if (!city) return { ok: false, message: "That city is not on the list." };
  if (city.id === state.agency.cityId) return { ok: false, message: "That is already home." };
  if (state.agency.satellites?.some((row) => row.cityId === city.id)) return { ok: false, message: "That satellite is already open." };
  const cost = 80_000;
  if (state.agency.cash < cost) return { ok: false, message: "Opening a satellite takes $80,000." };
  book(state, -cost, `Satellite office · ${city.city}`, "overhead");
  state.agency.satellites ??= [];
  state.agency.satellites.push({ cityId: city.id, tier: "Starter", upgrades: [], rent: city.rent });
  return { ok: true, message: `${city.city} is open. It has its own rent.` };
}

function fullName(state: GameState, salt: number): string {
  const rng = sideRng(state, salt);
  return `${pick(rng, NAMES_A)} ${pick(rng, NAMES_B)}`;
}

export function hireAgent(state: GameState): { ok: boolean; message: string } {
  if ((state.agents ?? []).length + (state.publicists ?? []).length >= deskCap(state)) {
    return { ok: false, message: "No free desks. Buy more desks or raise the office tier." };
  }
  const fee = 25_000;
  if (state.agency.cash < fee) return { ok: false, message: "The signing fee is $25,000." };
  book(state, -fee, "Hired an agent", "overhead");
  const genre = GENRES[state.seq % GENRES.length] ?? "Drama";
  const agent: FirmAgent = {
    id: nextId(state, "agt"),
    name: fullName(state, 1200 + (state.agents?.length ?? 0)),
    specialty: "Both",
    genre,
    negotiation: 40 + (state.seq % 25),
    network: 35 + (state.seq % 30),
    judgement: 38 + (state.seq % 28),
    capacity: 4,
    loyalty: 60,
    salary: 1800,
    tier: "Junior",
    autonomy: "threshold",
    feeThreshold: 2_000_000,
    satisfaction: 60,
    earnings: 0,
  };
  state.agents ??= [];
  state.agents.push(agent);
  return { ok: true, message: `${agent.name} joined as a junior agent.` };
}

export function setAgent(state: GameState, id: string, patch: Partial<Pick<FirmAgent, "autonomy" | "feeThreshold" | "tier">>): { ok: boolean; message: string } {
  const agent = state.agents?.find((row) => row.id === id);
  if (!agent) return { ok: false, message: "That agent is not on the team." };
  if (patch.autonomy) agent.autonomy = patch.autonomy;
  if (patch.feeThreshold) agent.feeThreshold = patch.feeThreshold;
  if (patch.tier && patch.tier !== agent.tier) {
    agent.tier = patch.tier;
    agent.capacity = patch.tier === "Partner" ? 12 : patch.tier === "Senior" ? 8 : patch.tier === "Agent" ? 6 : 4;
    agent.salary = patch.tier === "Partner" ? 4200 : patch.tier === "Senior" ? 3200 : patch.tier === "Agent" ? 2400 : 1800;
  }
  return { ok: true, message: `${agent.name} updated.` };
}

export function raiseAgent(state: GameState, id: string): { ok: boolean; message: string } {
  const agent = state.agents?.find((row) => row.id === id);
  if (!agent) return { ok: false, message: "That agent is not on the team." };
  agent.salary = Math.round(agent.salary * 1.1);
  agent.loyalty = Math.min(99, agent.loyalty + 6);
  return { ok: true, message: `${agent.name} has a higher salary.` };
}

export function fireAgent(state: GameState, id: string): { ok: boolean; message: string } {
  const agent = state.agents?.find((row) => row.id === id);
  if (!agent) return { ok: false, message: "That agent is not on the team." };
  state.agents = state.agents?.filter((row) => row.id !== id);
  for (const client of state.clients) if (client.agentId === id) client.agentId = null;
  return { ok: true, message: `${agent.name} has left.` };
}

export function assignAgent(state: GameState, personId: number, agentId: string): { ok: boolean; message: string } {
  const client = state.clients.find((row) => row.personId === personId && row.agency === "player");
  if (!client) return { ok: false, message: "They are not a client." };
  if (!agentId) {
    client.agentId = null;
    return { ok: true, message: `${client.name} is back with you.` };
  }
  const agent = state.agents?.find((row) => row.id === agentId);
  if (!agent) return { ok: false, message: "That agent is not on the team." };
  const load = state.clients.filter((row) => row.agentId === agent.id && row.agency === "player").length;
  if (client.agentId !== agent.id && load >= agent.capacity) return { ok: false, message: `${agent.name} is at capacity (${agent.capacity}).` };
  client.agentId = agent.id;
  return { ok: true, message: `${client.name} now sits with ${agent.name}.` };
}

export function hirePublicist(state: GameState, kind: PublicistKind): { ok: boolean; message: string } {
  if ((state.agents ?? []).length + (state.publicists ?? []).length >= deskCap(state)) {
    return { ok: false, message: "No free desks." };
  }
  if (state.agency.cash < 20_000) return { ok: false, message: "Hiring a publicist takes $20,000 up front." };
  book(state, -20_000, `Hired a ${kind} publicist`, "overhead");
  const person: Publicist = {
    id: nextId(state, "pr"),
    name: fullName(state, 2200 + (state.publicists?.length ?? 0)),
    kind,
    level: 1,
    salary: kind === "General" ? 1600 : 1500,
    personId: null,
    autonomy: "threshold",
  };
  state.publicists ??= [];
  state.publicists.push(person);
  return { ok: true, message: `${person.name} is on publicity.` };
}

export function assignPublicist(state: GameState, id: string, personId: number | null): { ok: boolean; message: string } {
  const row = state.publicists?.find((item) => item.id === id);
  if (!row) return { ok: false, message: "That publicist is not here." };
  row.personId = personId;
  return { ok: true, message: personId ? "Assigned to a client." : "Covering the whole agency." };
}

export function launchCampaign(state: GameState, kind: CampaignKind, personId: number, projectId?: string): { ok: boolean; message: string } {
  const costs: Record<CampaignKind, number> = { press: 40_000, charity: 25_000, interviews: 15_000, social: 12_000, brand: 8_000, crisis: 30_000, fyc: 50_000 };
  const weeks: Record<CampaignKind, number> = { press: 3, charity: 4, interviews: 2, social: 3, brand: 4, crisis: 2, fyc: 6 };
  const cost = costs[kind];
  if (state.agency.cash < cost) return { ok: false, message: "The campaign costs more than cash on hand." };
  const publicist = (state.publicists ?? []).find((row) => row.personId === personId) ?? state.publicists?.[0];
  if (!publicist) return { ok: false, message: "Hire a publicist first." };
  book(state, -cost, `Campaign · ${kind}`, "overhead");
  const campaign: Campaign = { id: nextId(state, "camp"), publicistId: publicist.id, personId, projectId, kind, cost, weeksLeft: weeks[kind] };
  state.campaigns ??= [];
  state.campaigns.push(campaign);
  return { ok: true, message: "The campaign is running." };
}

export function execsUnlocked(state: GameState): boolean {
  const clients = state.clients.filter((row) => row.agency === "player").length;
  return state.agency.tier !== "Boutique" && state.agency.tier !== "Rising" && clients >= 4 && state.agency.cash + (state.agency.reputation * 10_000) >= 500_000;
}

export function hireExecutive(state: GameState, role: ExecRole): { ok: boolean; message: string } {
  if (!execsUnlocked(state)) return { ok: false, message: "Executives unlock once the shop is Established, with four clients and real reserves." };
  if (state.executives?.some((row) => row.role === role)) return { ok: false, message: "That seat is filled." };
  const signing = 80_000;
  if (state.agency.cash < signing) return { ok: false, message: "The signing fee is $80,000." };
  book(state, -signing, `Hired ${role}`, "overhead");
  const greed = 40 + (state.seq % 40);
  const exec: Executive = {
    id: nextId(state, "exec"),
    role,
    name: fullName(state, 3300 + role.length),
    skill: 55 + (state.seq % 30),
    loyalty: 58,
    greed,
    salary: EXEC_SALARY[role],
    bonusRate: EXEC_RATES[role] + (greed > 70 ? 0.01 : 0),
    retentionBonus: greed < 45 ? EXEC_SALARY[role] * 4 : 0,
    years: 3,
    kpi: true,
    risk: 30 + greed / 2,
    started: { ...state.date },
  };
  state.executives ??= [];
  state.executives.push(exec);
  return { ok: true, message: `${exec.name} is ${role}. Bonus rate ${Math.round(exec.bonusRate * 1000) / 10}%.` };
}

export function setExecLimits(state: GameState, budget: number, risk: number): void {
  state.execBudget = Math.max(0, budget);
  state.execRisk = Math.max(0, Math.min(100, risk));
}

export function projectedBonus(state: GameState, profit: number): number {
  let total = 0;
  for (const exec of state.executives ?? []) {
    if (profit > 0) total += Math.round(profit * exec.bonusRate * (exec.kpi ? 1.1 : 1));
    else total += exec.retentionBonus;
  }
  return total;
}

export function yearNet(state: GameState, year: number): number {
  return state.ledger.filter((entry) => entry.date.year === year && entry.label !== "Opening cash").reduce((sum, entry) => sum + entry.amount, 0);
}

export function talkBlock(state: GameState, personId: number, when = state.date): string | null {
  const sameWeek = (state.talkBookings ?? []).filter((row) => row.personId === personId && row.date.year === when.year && row.date.week === when.week);
  if (sameWeek.length >= 1) return "Already on a show this week.";
  const hold = state.holds.find((row) => row.personId === personId && row.kind !== "pilot" && cmpDate(when, row.start) >= 0 && cmpDate(row.end, when) >= 0);
  if (hold) return hold.reason;
  for (const project of state.projects) {
    if (project.cancelled || project.ended) continue;
    const member = project.cast.find((row) => row.personId === personId && row.active && !row.writtenOut);
    if (!member) continue;
    const start = project.kind === "series" ? project.seasons[project.seasons.length - 1]?.shootStart ?? project.shootStart : project.shootStart;
    const end = project.kind === "series" ? shootEnd({ shootStart: start, shootWeeks: project.seasons[project.seasons.length - 1]?.shootWeeks ?? project.shootWeeks }) : shootEnd(project);
    if (cmpDate(when, start) >= 0 && cmpDate(when, end) <= 0) return `Shooting ${project.title} with no break that week.`;
  }
  if (scheduleConflict(state, personId, when, when)?.message && false) return null;
  return null;
}

export function pitchTalk(state: GameState, personId: number, showId: string, projectId?: string): { ok: boolean; message: string } {
  const show = TALK_SHOWS.find((row) => row.id === showId);
  const client = state.clients.find((row) => row.personId === personId && row.agency === "player");
  if (!show || !client) return { ok: false, message: "Pick a client and a real show." };
  if (client.fame === "Unknown" && show.fame > 30) return { ok: false, message: `${show.name} wants a known name.` };
  if (client.stats.starPower < show.fame && client.fame !== "Icon" && client.fame !== "A-list") {
    return { ok: false, message: `${show.name} is out of reach until fame rises.` };
  }
  const blocked = talkBlock(state, personId);
  if (blocked) return { ok: false, message: blocked };
  const weekCount = (state.talkBookings ?? []).filter((row) => row.showId === show.id && row.date.year === state.date.year && row.date.week === state.date.week).length;
  if (weekCount >= 2) return { ok: false, message: "That show has no slot left this week." };
  return finishTalk(state, client, show.id, projectId, "pitch");
}

export function resolveTalk(state: GameState, inviteId: string, accept: boolean): { ok: boolean; message: string } {
  const invite = state.talkInvites?.find((row) => row.id === inviteId && row.status === "pending");
  if (!invite) return { ok: false, message: "That invite is gone." };
  if (!accept) {
    invite.status = "declined";
    return { ok: true, message: "Declined the appearance." };
  }
  const blocked = talkBlock(state, invite.personId, invite.date);
  if (blocked) return { ok: false, message: blocked };
  const client = state.clients.find((row) => row.personId === invite.personId);
  if (!client) return { ok: false, message: "They are not on the file." };
  invite.status = "booked";
  return finishTalk(state, client, invite.showId, invite.projectId, "invite");
}

function finishTalk(state: GameState, client: Client, showId: string, projectId: string | undefined, via: string): { ok: boolean; message: string } {
  const show = TALK_SHOWS.find((row) => row.id === showId)!;
  const rng = sideRng(state, 6100 + client.personId + state.date.week);
  let roll = next(rng) * 100 + client.stats.talent * 0.25 + client.stats.marketability * 0.2;
  if (hasUpgrade(state, "green_room")) roll += 12;
  if ((state.publicists ?? []).length) roll += 8;
  const result = roll > 78 ? "great" : roll > 48 ? "fine" : "gaffe";
  const note = result === "great" ? "A charming appearance." : result === "fine" ? "A perfectly fine appearance." : "An awkward moment.";
  if (result === "great") {
    client.stats.buzz = Math.min(99, client.stats.buzz + 8);
    client.socialReach = (client.socialReach ?? 10) + Math.round(show.reach / 8);
    client.stats.marketability = Math.min(99, client.stats.marketability + 2);
  } else if (result === "fine") {
    client.stats.buzz = Math.min(99, client.stats.buzz + 3);
    client.socialReach = (client.socialReach ?? 10) + 2;
  } else {
    client.stats.buzz = Math.max(1, client.stats.buzz - 4);
    client.stats.reputation = Math.max(1, client.stats.reputation - 5);
  }
  const project = projectId ? state.projects.find((row) => row.id === projectId) : undefined;
  if (project && !project.ended) {
    const lift = result === "gaffe" ? 0 : show.country === "US" ? 40_000 : 25_000;
    project.marketing += lift;
  }
  state.talkBookings ??= [];
  state.talkBookings.unshift({ id: nextId(state, "talk"), personId: client.personId, showId, date: { ...state.date }, projectId, result, note });
  state.inbox.unshift({
    id: nextId(state, "in"),
    date: { ...state.date },
    kind: "news",
    title: `${client.name} on ${show.name}`,
    body: `${note} Booked via ${via}.`,
    href: "/talk",
    read: false,
    resolved: false,
  });
  return { ok: true, message: `${client.name}: ${note}` };
}

export function blocksStudioOffer(state: GameState, tier: string, filmStar: number): boolean {
  const city = cityOf(state);
  if (city.hub === "major") return false;
  if (tier !== "tentpole" && tier !== "studio") return false;
  const rng = sideRng(state, 7700 + state.date.year * 60 + state.date.week + Math.round(filmStar));
  return !keepBigOffer(city.hub, tier, filmStar, state.agency.reputation, next(rng));
}

export function agentPlan(state: GameState, offer: Offer): "accept" | "decline" | "escalate" {
  const client = state.clients.find((row) => row.personId === offer.personId && row.agency === "player");
  if (!client?.agentId) return "escalate";
  const agent = state.agents?.find((row) => row.id === client.agentId);
  if (!agent) return "escalate";
  const project = state.projects.find((row) => row.id === offer.projectId);
  const escalate =
    offer.fee >= agent.feeThreshold ||
    offer.pay === "pilot" ||
    (offer.deal && offer.deal.seasons >= 3) ||
    Boolean(project?.franchiseId) ||
    Boolean(project?.playerInvolved) ||
    client.loyalty < 42 ||
    agent.autonomy === "important";
  if (escalate && agent.autonomy !== "full") return "escalate";
  if (agent.autonomy === "threshold" && offer.fee >= agent.feeThreshold) return "escalate";
  const fit = agent.judgement + (client.preferredGenres.includes(agent.genre) ? 15 : 0) + agent.negotiation / 5;
  return fit >= 70 ? "accept" : "decline";
}

export function tickV7(state: GameState, catalog: Catalog, autoResolve: boolean): void {
  if (autoResolve) {
    tickRivals(state);
    return;
  }
  ensureV7(state, catalog);
  const relocating = state.agency.relocating;
  if (relocating && cmpDate(state.date, relocating.arrives) >= 0) {
    const city = cityById(relocating.cityId);
    if (city) {
      state.agency.cityId = city.id;
      state.agency.rent = rentFor(city, state.agency.officeTier ?? "Starter");
      state.inbox.unshift({
        id: nextId(state, "in"),
        date: { ...state.date },
        kind: "system",
        title: `The office is now in ${city.city}`,
        body: `${city.tentpole === "Rare" ? "Tentpole offers stay rare." : "The local market is open."} Rent is updated.`,
        read: false,
        resolved: false,
      });
    }
    state.agency.relocating = null;
  }
  tickRivals(state);
  tickCampaigns(state);
  tickPeople(state, catalog, autoResolve);
  if (state.date.week === 2) payBonuses(state);
  if (!autoResolve && state.date.week >= 46) warnBonus(state);
  if ((state.date.week - 1) % 4 === 0) {
    const extra = staffWeekly(state);
    if (extra > 0) book(state, -extra * 4, "Agents, executives, and office upkeep", "overhead");
  }
}

function tickCampaigns(state: GameState): void {
  for (const campaign of state.campaigns ?? []) {
    if (campaign.weeksLeft <= 0) continue;
    campaign.weeksLeft -= 1;
    if (campaign.weeksLeft > 0) continue;
    const client = state.clients.find((row) => row.personId === campaign.personId);
    if (!client) continue;
    if (campaign.kind === "social" || campaign.kind === "press") {
      client.stats.buzz = Math.min(99, client.stats.buzz + 6);
      client.socialReach = (client.socialReach ?? 10) + 8;
    } else if (campaign.kind === "charity" || campaign.kind === "crisis") {
      client.stats.reputation = Math.min(99, client.stats.reputation + 5);
      client.stats.buzz = Math.max(1, client.stats.buzz - 1);
    } else if (campaign.kind === "fyc") {
      const project = state.projects.find((row) => row.id === campaign.projectId);
      if (project) project.fycSpend += campaign.cost;
    } else if (campaign.kind === "brand") {
      client.stats.marketability = Math.min(99, client.stats.marketability + 4);
    } else {
      client.stats.buzz = Math.min(99, client.stats.buzz + 3);
    }
    campaign.note = "Finished";
  }
}

function tickPeople(state: GameState, catalog: Catalog, autoResolve: boolean): void {
  const rng = sideRng(state, 5100 + state.date.year * 52 + state.date.week);
  if (hasUpgrade(state, "rehearsal") && state.date.week % 4 === 0) {
    for (const client of state.clients) {
      if (client.agency !== "player") continue;
      client.stats.talent = Math.min(99, client.stats.talent + 1);
    }
  }
  if (hasUpgrade(state, "podcast")) {
    for (const client of state.clients) if (client.agency === "player") client.socialReach = (client.socialReach ?? 10) + 1;
  }
  for (const agent of state.agents ?? []) {
    if (hasUpgrade(state, "training_room") && chance(rng, 0.15)) agent.judgement = Math.min(95, agent.judgement + 1);
    const quit = agent.loyalty < 30 && chance(rng, hasUpgrade(state, "workspace") ? 0.02 : 0.05);
    if (quit) {
      state.agentNotes ??= [];
      state.agentNotes.unshift({ date: { ...state.date }, text: `${agent.name} left for another shop.` });
      state.agents = state.agents?.filter((row) => row.id !== agent.id);
    }
  }
  if (autoResolve) return;
  maybeDirect(state, rng);
  maybeTalkInvite(state, rng);
  maybeBid(state, catalog, rng);
}

function maybeDirect(state: GameState, rng: ReturnType<typeof sideRng>): void {
  if (state.events.some((event) => !event.resolved && event.type === "wants_direct")) return;
  const players = state.clients.filter((client) => client.agency === "player" && client.contract);
  if (!players.length || !chance(rng, 0.08)) return;
  const client = pick(rng, players);
  const age = client.birthday ? state.date.year - Number(client.birthday.slice(0, 4)) : 35;
  const push = (client.directingAptitude ?? 30) / 400 + client.traits.ambition / 500 + (age > 45 ? 0.02 : 0);
  if (!chance(rng, Math.min(0.35, push))) return;
  state.events.unshift({
    id: nextId(state, "evt"),
    type: "wants_direct",
    title: `${client.name} wants to direct`,
    body: "They have a film in mind. Back a real debut, steer them to something small, or talk them out of it.",
    personId: client.personId,
    date: { ...state.date },
    expires: addWeeks(state.date, 2),
    choices: [
      { id: "direct_back", label: "Back a directing debut", hint: "Spend development money and block their calendar." },
      { id: "direct_small", label: "Steer them to a small first film", hint: "Cheaper, shorter, lower stakes." },
      { id: "direct_talk", label: "Talk them out of it", hint: "Loyalty drops if they feel unheard." },
    ],
  });
  const event = state.events[0]!;
  state.inbox.unshift({
    id: nextId(state, "in"),
    date: { ...state.date },
    kind: "event",
    title: event.title,
    body: event.body,
    href: `/dashboard#event-${event.id}`,
    read: false,
    resolved: false,
    refId: event.id,
    decision: true,
  });
}

function maybeTalkInvite(state: GameState, rng: ReturnType<typeof sideRng>): void {
  const players = state.clients.filter((client) => client.agency === "player" && client.stats.starPower >= 35);
  if (!players.length || !chance(rng, 0.12)) return;
  const client = pick(rng, players);
  const home = cityOf(state);
  const pool = TALK_SHOWS.filter((show) => client.stats.starPower + 15 >= show.fame && (home.region === "UK" ? show.country === "UK" : show.country === "US" || home.hub !== "major"));
  const show = pool.length ? pick(rng, pool) : pick(rng, TALK_SHOWS.filter((row) => row.fame < 40));
  if (talkBlock(state, client.personId)) return;
  const invite: TalkInvite = { id: nextId(state, "tinv"), personId: client.personId, showId: show.id, date: { ...state.date }, status: "pending" };
  state.talkInvites ??= [];
  state.talkInvites.unshift(invite);
  state.inbox.unshift({
    id: nextId(state, "in"),
    date: { ...state.date },
    kind: "event",
    title: `${client.name} is invited on ${show.name}`,
    body: "One day, not a shoot. Accept or decline this week.",
    href: `/talk#invite-${invite.id}`,
    read: false,
    resolved: false,
    refId: invite.id,
    decision: true,
  });
}

function maybeBid(state: GameState, catalog: Catalog, rng: ReturnType<typeof sideRng>): void {
  if (!chance(rng, 0.05)) return;
  if (state.events.some((event) => !event.resolved && event.type === "bidding")) return;
  const taken = new Set(state.clients.map((client) => client.personId));
  const hot = catalog.actors.filter((actor) => !taken.has(actor.id) && actor.popularity > 40).slice(0, 30);
  if (!hot.length) return;
  const person = pick(rng, hot);
  const rival = pick(rng, state.rivals);
  if (!state.clients.some((row) => row.personId === person.id)) {
    state.clients.push(clientFromCatalog(person, "unsigned", state.date, null));
  }
  state.events.unshift({
    id: nextId(state, "evt"),
    type: "bidding",
    title: `${rival.name} is bidding for ${person.name}`,
    body: "A hot unsigned actor has two offers. Match the terms or let the rival take them.",
    personId: person.id,
    date: { ...state.date },
    expires: addWeeks(state.date, 2),
    choices: [
      { id: "bid_match", label: "Match and sign at 8%", hint: "You win if reputation and the office are competitive." },
      { id: "bid_pass", label: "Let the rival sign them", hint: "No spend. They leave the unsigned pool." },
    ],
  });
  const event = state.events[0]!;
  state.inbox.unshift({
    id: nextId(state, "in"),
    date: { ...state.date },
    kind: "event",
    title: event.title,
    body: event.body,
    href: `/dashboard#event-${event.id}`,
    read: false,
    resolved: false,
    refId: event.id,
    decision: true,
  });
}

function payBonuses(state: GameState): void {
  const execs = state.executives ?? [];
  if (!execs.length) return;
  const year = state.date.year - 1;
  if (state.profitYears?.some((row) => row.year === year)) return;
  const profit = yearNet(state, year);
  const bonus = projectedBonus(state, profit);
  if (bonus > 0) book(state, -bonus, "Executive profit bonus", "overhead");
  state.profitYears ??= [];
  state.profitYears.push({ year, profit, bonus });
  state.execNotes ??= [];
  state.execNotes.unshift({
    date: { ...state.date },
    text: profit > 0 ? `Profit bonuses of ${bonus} paid on ${year}.` : `No profit bonus for ${year}. Retention only where the contract has it.`,
  });
  for (const exec of execs) {
    if (profit <= 0 && exec.retentionBonus === 0) exec.loyalty = Math.max(1, exec.loyalty - 8);
    else exec.loyalty = Math.min(99, exec.loyalty + 2);
  }
}

function warnBonus(state: GameState): void {
  const outlook = projectedBonus(state, Math.max(0, yearNet(state, state.date.year)));
  if (outlook < 50_000 || outlook < state.agency.cash * 0.4) return;
  if (state.inbox.some((item) => item.title.startsWith("CFO:") && item.date.year === state.date.year)) return;
  state.inbox.unshift({
    id: nextId(state, "in"),
    date: { ...state.date },
    kind: "system",
    title: "CFO: profit bonuses are larger than the cushion",
    body: "The year-end pool is coming in the first weeks of next year. Cash is thin relative to that check.",
    href: "/finance",
    read: false,
    resolved: false,
  });
}

export function dismissWhatsNew(state: GameState): void {
  state.whatsNewSeen = true;
}
