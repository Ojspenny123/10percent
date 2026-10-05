import { book } from "./actions";
import { sideRng } from "./career";
import { BUDGETS, PRESTIGE_GENRE } from "./constants";
import { characterName, loglineFor, scriptNote } from "./copy";
import { blankProject, castFromClient, makeTitle, nextId, rememberTitle } from "./generate";
import {
  cashWarning,
  loanWeek,
  packageCost,
  payLoyalty,
  quotePackage,
  rollViral,
  runWaterfall,
  sleeperWeeks,
  streamingIncome,
  upfrontFee,
  weeklyOverhead,
  type WaterfallTalent,
} from "./money";
import { clamp, clientFromCatalog } from "./people";
import { chance, int } from "./rng";
import { profitLabelFor } from "./results";
import { addWeeks, cmpDate, formatDate, scheduleConflict } from "./schedule";
import type {
  ActionResult,
  BudgetTier,
  Catalog,
  Client,
  FinancePlan,
  GameDate,
  GameState,
  Production,
  Project,
  RoleType,
} from "./types";

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function lists(state: GameState): void {
  state.productions ??= [];
  state.loans ??= [];
  state.payouts ??= [];
}

function saltOf(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % 9973;
  return n + 1;
}

function note(state: GameState, title: string, body: string, href?: string): void {
  state.inbox.unshift({
    id: `in_${++state.seq}`,
    date: { ...state.date },
    kind: "money",
    title,
    body,
    href,
    read: false,
    resolved: false,
  });
}

function fail(state: GameState, message: string): ActionResult {
  return { state, ok: false, message };
}

function ok(state: GameState, message: string, href?: string): ActionResult {
  return { state, ok: true, message, href };
}

const TIERS: BudgetTier[] = ["micro-indie", "indie", "mid", "studio", "tentpole"];

export function tierLabel(tier: BudgetTier): string {
  if (tier === "micro-indie") return "Micro";
  if (tier === "indie") return "Low";
  return tier[0]!.toUpperCase() + tier.slice(1);
}

function directorRate(tier: BudgetTier, acclaim: number): number {
  const base = { "micro-indie": 20_000, indie: 120_000, mid: 750_000, studio: 2_000_000, tentpole: 5_000_000 }[tier];
  return Math.max(5_000, Math.round((base * (0.7 + acclaim / 140)) / 1000) * 1000);
}

function findProduction(state: GameState, id: string): Production | undefined {
  return state.productions?.find((row) => row.id === id);
}

export function developProduction(input: GameState, genre: string, tier: BudgetTier, shootInWeeks: number, shootWeeks: number): ActionResult {
  const state = clone(input);
  lists(state);
  if (state.gameOver) return fail(state, "The agency is closed.");
  if (!TIERS.includes(tier)) return fail(state, "Pick a budget tier.");
  const open = state.productions!.filter((row) => row.stage === "development" || row.stage === "packaging");
  if (open.length >= 2) return fail(state, "Two pictures are already in development. Finish or abandon one.");
  const cost = 8_000;
  const cushion = weeklyOverhead(state) * 8;
  if (state.agency.cash < cost + cushion && tier !== "micro-indie") {
    return fail(state, "Development needs $8K plus eight weeks of rent and salaries still in the account.");
  }
  if (state.agency.cash < cost) return fail(state, "Development costs $8,000. Cash does not cover it.");
  if ((tier === "studio" || tier === "tentpole") && state.agency.cash < 2_000_000) {
    return fail(state, `${tierLabel(tier)} pictures need at least $2M in cash before development. Build reserves, or stay at micro and low.`);
  }
  if (tier === "mid" && state.agency.cash < 750_000) {
    return fail(state, "Mid-budget development waits until cash is at least $750K.");
  }
  book(state, -cost, `Development · ${genre}`, "production");
  const rng = sideRng(state, 410 + state.productions!.length + saltOf(genre));
  const used = new Set(state.usedTitles);
  const concepts = [0, 1, 2].map(() => {
    const title = makeTitle(rng, genre, used);
    rememberTitle(state, title);
    const hook = int(rng, 28, 96);
    const scriptQuality = int(rng, 34, 92);
    return { title, logline: loglineFor(rng, genre), hook, scriptQuality };
  });
  const production: Production = {
    id: nextId(state, "prod"),
    projectId: null,
    stage: "development",
    genre,
    tier,
    concepts,
    conceptIndex: null,
    hookRevealed: false,
    directorId: null,
    directorName: "",
    directorFee: 0,
    directorPull: 40,
    directorAcclaim: 50,
    cast: [],
    shootInWeeks: Math.max(6, Math.min(30, Math.round(shootInWeeks) || 10)),
    shootWeeks: Math.max(3, Math.min(18, Math.round(shootWeeks) || 6)),
    plan: null,
    investorShare: 0,
    distributorFee: tier === "micro-indie" ? 0.3 : tier === "indie" ? 0.25 : tier === "tentpole" ? 0.15 : 0.2,
    distribution: "undecided",
    salePrice: 0,
    marketing: 0,
    budget: 0,
    events: [],
    sleeper: false,
    librarySold: false,
  };
  state.productions!.unshift(production);
  return ok(state, `${concepts[0]!.title} and two other concepts are on the desk.`, `/productions/${production.id}`);
}

export function chooseConcept(input: GameState, productionId: string, index: number): ActionResult {
  const state = clone(input);
  lists(state);
  const production = findProduction(state, productionId);
  if (!production || production.stage !== "development") return fail(state, "That picture is not waiting on a concept.");
  const concept = production.concepts[index];
  if (!concept) return fail(state, "Pick one of the three concepts.");
  production.conceptIndex = index;
  production.stage = "packaging";
  return ok(state, `${concept.title} is the picture. Attach a director and a lead.`, `/productions/${production.id}`);
}

export function abandonProduction(input: GameState, productionId: string): ActionResult {
  const state = clone(input);
  const production = findProduction(state, productionId);
  if (!production) return fail(state, "That production is gone.");
  if (production.stage === "financed" || production.stage === "released") return fail(state, "A financed picture has to play out or be sold.");
  production.stage = "abandoned";
  return ok(state, "Development is shelved. The $8,000 is spent.", "/productions");
}

function plannedWindow(state: GameState, production: Production) {
  const shootStart = addWeeks(state.date, production.shootInWeeks);
  const prepStart = addWeeks(shootStart, -2);
  const finish = addWeeks(shootStart, production.shootWeeks);
  return { prepStart, shootStart, finish };
}

function personClient(state: GameState, catalog: Catalog, personId: number): Client | null {
  const existing = state.clients.find((client) => client.personId === personId);
  if (existing) return existing;
  const actor = catalog.actors.find((row) => row.id === personId);
  if (!actor) return null;
  return clientFromCatalog(actor, "unsigned", state.date, null);
}

export function attachDirector(input: GameState, catalog: Catalog, productionId: string, directorId: number): ActionResult {
  const state = clone(input);
  const production = findProduction(state, productionId);
  if (!production || production.stage !== "packaging") return fail(state, "Attach a director while the picture is being packaged.");
  const director = catalog.directors.find((row) => row.id === directorId);
  if (!director) return fail(state, "That director is not in the cache.");
  const acclaim = clamp(director.avgRating * 10, 1, 99);
  const pull = clamp(20 + director.popularity, 1, 99);
  production.directorId = director.id;
  production.directorName = director.name;
  production.directorAcclaim = acclaim;
  production.directorPull = pull;
  production.directorFee = directorRate(production.tier, acclaim);
  return ok(state, `${director.name} is attached at $${production.directorFee.toLocaleString("en-US")}.`, `/productions/${production.id}`);
}

export function attachCast(input: GameState, catalog: Catalog, productionId: string, personId: number, role: RoleType, fee: number): ActionResult {
  const state = clone(input);
  const production = findProduction(state, productionId);
  if (!production || production.stage !== "packaging") return fail(state, "Cast is attached during packaging, before the money is locked.");
  if (production.cast.some((member) => member.personId === personId)) return fail(state, "They are already on this picture.");
  const client = personClient(state, catalog, personId);
  if (!client) return fail(state, "That actor is not available.");
  const quote = quotePackage({ fame: client.fame, role, tier: production.tier, filmStar: client.filmStar, genre: production.genre });
  const market = quote.fee;
  const offered = Math.max(5_000, Math.round((fee || market) / 1000) * 1000);
  if (client.agency !== "player" && offered < market * 0.9) {
    return fail(state, `${client.name} will not work below market ($${market.toLocaleString("en-US")}).`);
  }
  const window = plannedWindow(state, production);
  const alreadyPackaging = (state.productions ?? []).some((row) => row.id !== production.id && row.stage !== "abandoned" && row.cast.some((member) => member.personId === personId));
  if (alreadyPackaging || scheduleConflict(state, personId, window.prepStart, window.finish)) {
    return fail(state, `${client.name} is already booked across that shoot.`);
  }
  const spec = BUDGETS[production.tier];
  const castSum = production.cast.reduce((sum, member) => sum + member.fee, 0) + offered + production.directorFee;
  if (castSum > spec.max * 0.7 && (production.tier === "micro-indie" || production.tier === "indie")) {
    return fail(state, "That fee blows the budget tier. Raise the tier or offer less.");
  }
  const rng = sideRng(state, 80 + personId);
  const member = castFromClient(client, role, production.cast.length + 1, offered, quote.points, characterName(rng));
  member.backendStyle = quote.style;
  member.bonuses = quote.bonuses;
  production.cast.push(member);
  let loyaltyLine = "Market rate. No loyalty change.";
  if (client.agency === "player") {
    const loyalty = payLoyalty(market, offered);
    const live = state.clients.find((row) => row.personId === personId && row.agency === "player");
    if (live) {
      live.loyalty = clamp(live.loyalty + loyalty.delta, 1, 99);
      if (loyalty.delta <= -6) live.mood = live.mood === "Furious" ? "Furious" : "Uneasy";
      if (loyalty.delta >= 8 && (live.mood === "Uneasy" || live.mood === "Content")) live.mood = "Thrilled";
    }
    loyaltyLine = loyalty.line;
  }
  return ok(state, `${client.name} is in as ${role} for $${offered.toLocaleString("en-US")}. ${loyaltyLine}`, `/productions/${production.id}`);
}

export function financeProduction(input: GameState, productionId: string, plan: FinancePlan): ActionResult {
  const state = clone(input);
  lists(state);
  const production = findProduction(state, productionId);
  if (!production || production.stage !== "packaging") return fail(state, "Only a packaged picture can be financed.");
  const concept = production.concepts[production.conceptIndex ?? -1];
  if (!concept) return fail(state, "Choose a concept first.");
  if (!production.directorId) return fail(state, "Attach a director before financing.");
  if (!production.cast.some((member) => member.role === "Lead" || member.role === "Co-lead")) return fail(state, "The picture needs a lead.");
  const marketingRate = BUDGETS[production.tier].marketing;
  const cast = production.cast.reduce((sum, member) => sum + member.fee, 0);
  const preview = packageCost({ tier: production.tier, cast, director: production.directorFee, marketing: 0 });
  const marketing = Math.round((preview.cast + preview.director + preview.crew + preview.production + preview.contingency) * marketingRate);
  const cost = packageCost({ tier: production.tier, cast, director: production.directorFee, marketing });
  const bay = state.agency.upgrades?.includes("edit_bay") ? 0.92 : 1;
  const negative = Math.round((cost.cast + cost.director + cost.crew + cost.production + cost.contingency) * bay);
  let playerShare = negative;
  let loanPrincipal = 0;
  let investorShare = 0;
  let presale = 0;
  if (plan === "loan") {
    playerShare = Math.round(negative * 0.35);
    loanPrincipal = negative - playerShare;
  } else if (plan === "investors") {
    playerShare = Math.round(negative * 0.4);
    investorShare = 0.5;
  } else if (plan === "studio") {
    presale = Math.round(negative * 0.7);
    playerShare = negative - presale;
    investorShare = 0.4;
    production.distributorFee = Math.max(production.distributorFee, 0.25);
  }
  const cushion = weeklyOverhead(state) * Math.max(8, production.shootWeeks);
  const playerCash = playerShare + marketing;
  if (state.agency.cash < playerCash + cushion) {
    return fail(state, `This plan needs $${(playerCash + cushion).toLocaleString("en-US")} in cash so rent and salaries survive the shoot. You have $${state.agency.cash.toLocaleString("en-US")}.`);
  }
  book(state, -playerCash, `Production spend · ${concept.title}`, "production");
  if (plan === "loan") {
    state.loans!.push({
      id: nextId(state, "loan"),
      productionId: production.id,
      label: `Production loan · ${concept.title}`,
      principal: loanPrincipal,
      balance: loanPrincipal,
      annualRate: 0.09,
      emergency: false,
    });
  }
  const window = plannedWindow(state, production);
  const release = addWeeks(window.shootStart, production.shootWeeks + (production.tier === "tentpole" || production.tier === "studio" ? 20 : 12));
  const project = blankProject(state, {
    kind: "film",
    title: concept.title,
    logline: concept.logline,
    genres: [production.genre],
    budgetTier: production.tier,
    budget: negative,
    marketing,
    directorId: production.directorId,
    directorName: production.directorName,
    directorPull: production.directorPull,
    directorAcclaim: production.directorAcclaim,
    studio: state.agency.name,
    prepStart: window.prepStart,
    shootStart: window.shootStart,
    shootWeeks: production.shootWeeks,
    postWeeks: production.tier === "tentpole" || production.tier === "studio" ? 20 : 12,
    release,
    phase: "development",
    scriptQuality: concept.scriptQuality,
    scriptNote: scriptNote(concept.scriptQuality),
    prestige: clamp((PRESTIGE_GENRE[production.genre] ?? 50) * 0.7 + production.directorAcclaim * 0.25, 1, 99),
    risk: clamp(70 - concept.scriptQuality * 0.4, 1, 99),
    cast: production.cast.map((member) => ({ ...member })),
    playerInvolved: true,
  });
  state.projects.push(project);
  state.genreTallies[production.genre] = (state.genreTallies[production.genre] ?? 0) + 1;
  production.projectId = project.id;
  production.stage = "financed";
  production.plan = plan;
  production.investorShare = investorShare;
  production.marketing = marketing;
  production.budget = negative;
  production.salePrice = Math.round(negative * (0.9 + concept.scriptQuality / 250));
  return ok(state, `${concept.title} is financed with ${plan}. It shoots ${formatDate(window.shootStart)}.`, `/productions/${production.id}`);
}

export function setMarketing(input: GameState, productionId: string, amount: number): ActionResult {
  const state = clone(input);
  const production = findProduction(state, productionId);
  const project = production?.projectId ? state.projects.find((row) => row.id === production.projectId) : undefined;
  if (!production || !project || production.stage !== "financed") return fail(state, "Marketing is set on a financed picture that has not opened.");
  if (project.ended) return fail(state, "The film has already opened.");
  const next = Math.max(0, Math.round(amount / 1000) * 1000);
  const delta = next - project.marketing;
  if (delta > 0 && state.agency.cash < delta + weeklyOverhead(state) * 4) {
    return fail(state, "That marketing spend would leave rent uncovered.");
  }
  if (delta !== 0) book(state, -delta, `Marketing · ${project.title}`, "production");
  project.marketing = next;
  production.marketing = next;
  return ok(state, `Marketing on ${project.title} is $${next.toLocaleString("en-US")}.`, `/productions/${production.id}`);
}

export function chooseDistribution(input: GameState, productionId: string, mode: "sale" | "theatrical"): ActionResult {
  const state = clone(input);
  const production = findProduction(state, productionId);
  const project = production?.projectId ? state.projects.find((row) => row.id === production.projectId) : undefined;
  if (!production || !project || production.stage !== "financed") return fail(state, "Distribution is chosen after the picture is financed.");
  if (project.ended) return fail(state, "Too late. The film already opened.");
  production.distribution = mode;
  if (mode === "sale") {
    return ok(state, `${project.title} will be sold for about $${production.salePrice.toLocaleString("en-US")}. Upside is capped.`, `/productions/${production.id}`);
  }
  return ok(state, `${project.title} will go out theatrically. A distributor takes ${Math.round(production.distributorFee * 100)}%.`, `/productions/${production.id}`);
}

export function sellLibrary(input: GameState, productionId: string): ActionResult {
  const state = clone(input);
  const production = findProduction(state, productionId);
  const project = production?.projectId ? state.projects.find((row) => row.id === production.projectId) : undefined;
  if (!production || !project || production.stage !== "released" || production.librarySold) return fail(state, "Only a finished picture you still own can be sold off.");
  const price = Math.max(10_000, Math.round(project.budget * 0.25));
  book(state, price, `Library sale · ${project.title}`, "production");
  production.librarySold = true;
  return ok(state, `Sold the library rights to ${project.title} for $${price.toLocaleString("en-US")}.`, "/finance");
}

export function takeEmergencyLoan(input: GameState): ActionResult {
  const state = clone(input);
  lists(state);
  if (state.gameOver) return fail(state, "The agency is already closed.");
  const emergencies = state.loans!.filter((loan) => loan.emergency && loan.balance > 0);
  if (emergencies.length >= 2) return fail(state, "The bank will not write a third emergency note.");
  const hole = Math.max(0, -state.agency.cash);
  const principal = Math.max(80_000, hole + weeklyOverhead(state) * 10);
  state.loans!.push({
    id: nextId(state, "loan"),
    productionId: null,
    label: "Emergency loan",
    principal,
    balance: principal,
    annualRate: 0.28,
    emergency: true,
  });
  book(state, principal, "Emergency loan", "production");
  state.insolventWeeks = 0;
  return ok(state, `Emergency loan of $${principal.toLocaleString("en-US")} at 28% a year. Payments start next week.`, "/finance");
}

function splitAmount(total: number, parts: number): number[] {
  const safe = Math.max(0, Math.round(total));
  const base = Math.floor(safe / parts);
  const rows = Array.from({ length: parts }, () => base);
  rows[0] = safe - base * (parts - 1);
  return rows;
}

/** Tell the player what a client's backend points turned into, including when they turned into nothing. */
function explainBackend(
  state: GameState,
  project: Project,
  row: { personId: number; name: string; backend: number; commissionRate: number },
  agencyProfit: number,
): void {
  const member = project.cast.find((item) => item.personId === row.personId);
  if (!member || member.backend <= 0 || (member.backendStyle ?? "box_office") === "none") return;
  const id = `in_backend_${project.id}_${row.personId}`;
  if (state.inbox.some((item) => item.id === id)) return;
  const commission = Math.round((row.backend * row.commissionRate) / 100);
  const body =
    row.backend > 0
      ? `${row.name} earns about $${Math.round(row.backend).toLocaleString("en-US")} in backend. Your ${row.commissionRate}% is about $${commission.toLocaleString("en-US")}, paid week by week as the film earns${member.backendStyle === "net" ? " once it is in profit" : ""}.`
      : member.backendStyle === "net"
        ? `${row.name} has ${member.backend} net points, which only pay once the film is in profit. The picture was about $${Math.max(0, Math.round(-agencyProfit)).toLocaleString("en-US")} short, so the backend is $0.`
        : `${row.name} has ${member.backend} points, but the film took too little in rentals for them to pay anything.`;
  state.inbox.unshift({
    id,
    date: { ...state.date },
    kind: "money",
    title: row.backend > 0 ? `Backend on ${project.title}: ${row.name}` : `No backend on ${project.title}: ${row.name}`,
    body,
    href: "/finance",
    read: false,
    resolved: false,
  });
}

type WaterfallInput = Parameters<typeof runWaterfall>[0];

/** Everything the waterfall needs for a released film, built from the save as it stands. */
function waterfallFor(state: GameState, project: Project): { production: Production | undefined; input: WaterfallInput } {
  lists(state);
  const production = state.productions!.find((row) => row.projectId === project.id);
  if (project.streamingTotal == null && production?.distribution !== "sale") {
    const concept = production?.concepts[production.conceptIndex ?? -1];
    project.streamingTotal = streamingIncome({
      budget: project.budget,
      tier: project.budgetTier,
      genre: project.genres[0] ?? "Drama",
      critic: project.criticScore ?? 50,
      audience: project.audienceScore ?? 50,
      hook: concept?.hook ?? project.scriptQuality,
    });
  }
  const talent: WaterfallTalent[] = project.cast.map((member) => {
    const client = state.clients.find((row) => row.personId === member.personId);
    return {
      personId: member.personId,
      name: member.name,
      upfront: member.fee,
      style: member.backendStyle ?? (member.backend > 0 ? "box_office" : "none"),
      points: member.backend,
      bonuses: member.bonuses ?? [],
      isPlayerClient: member.isPlayerClient,
      commissionRate: client?.contract?.commission ?? 10,
    };
  });
  const loanBalance = state.loans!.filter((loan) => loan.productionId === production?.id).reduce((sum, loan) => sum + loan.balance, 0);
  return {
    production,
    input: {
      domestic: project.domesticTotal ?? 0,
      international: project.internationalTotal ?? 0,
      streaming: project.streamingTotal ?? 0,
      budget: production?.budget || project.budget,
      marketing: project.marketing,
      distributorRate: production?.distributorFee ?? 0.22,
      investorShare: production?.investorShare ?? 0,
      loanBalance,
      talent,
      sale: production?.distribution === "sale" ? production.salePrice : undefined,
    },
  };
}

/**
 * Backend follows the box office. Each week's payout is the extra backend earned once that week's
 * takings are counted, so net points only start once the picture is in profit. The last step lands
 * after the streaming window and settles the full amount.
 *
 * `start` is the release date and `paid` is what the client has already been paid (talent terms).
 * Steps that fell due before today are rolled into one catch-up payout due now.
 */
function planBackend(
  state: GameState,
  project: Project,
  input: WaterfallInput,
  row: { personId: number; backend: number },
  start: GameDate,
  paid: number,
): { amount: number; due: GameDate }[] {
  const weekly = (project.weeklyGross ?? []).filter((n) => n > 0);
  const weeklyTotal = weekly.reduce((sum, n) => sum + n, 0);
  const steps: { due: GameDate; cumulative: number }[] = [];
  if (weeklyTotal > 0) {
    let running = 0;
    weekly.forEach((n, index) => {
      running += n;
      const fraction = running / weeklyTotal;
      const partial = runWaterfall({
        ...input,
        domestic: input.domestic * fraction,
        international: input.international * fraction,
        sale: input.sale != null ? input.sale * fraction : undefined,
        streaming: 0,
      });
      steps.push({ due: addWeeks(start, index + 1), cumulative: partial.talent.find((item) => item.personId === row.personId)?.backend ?? 0 });
    });
    steps.push({ due: addWeeks(start, weekly.length + 10), cumulative: row.backend });
  } else {
    [2, 8, 16, 28].forEach((weeks, index) => steps.push({ due: addWeeks(start, weeks), cumulative: (row.backend * (index + 1)) / 4 }));
  }
  const plan: { amount: number; due: GameDate }[] = [];
  let running = paid;
  let catchUp = 0;
  for (const step of steps) {
    const amount = Math.round(Math.min(row.backend, step.cumulative) - running);
    if (amount <= 0) continue;
    running += amount;
    if (cmpDate(step.due, state.date) <= 0) catchUp += amount;
    else plan.push({ amount, due: step.due });
  }
  if (catchUp > 0) plan.unshift({ amount: catchUp, due: { ...state.date } });
  return plan;
}

export function scheduleTalentPay(state: GameState, project: Project): void {
  if (project.kind !== "film") return;
  lists(state);
  if (state.payouts!.some((row) => row.projectId === project.id)) return;
  const { production, input } = waterfallFor(state, project);
  const waterfall = runWaterfall(input);
  if (production) {
    production.waterfall = { lines: waterfall.lines, agencyProfit: waterfall.agencyProfit };
    production.sleeper = Boolean(project.sleeper);
    production.stage = "released";
  }
  for (const row of waterfall.talent) {
    if (!row.isPlayerClient) continue;
    explainBackend(state, project, row, waterfall.agencyProfit);
    for (const step of planBackend(state, project, input, row, state.date, 0)) {
      state.payouts!.push({
        id: nextId(state, "pay"),
        projectId: project.id,
        personId: row.personId,
        name: row.name,
        kind: "backend",
        amount: step.amount,
        commissionRate: row.commissionRate,
        due: step.due,
        paid: false,
      });
    }
    if (row.bonuses > 0) {
      state.payouts!.push({
        id: nextId(state, "pay"),
        projectId: project.id,
        personId: row.personId,
        name: row.name,
        kind: "bonus",
        amount: row.bonuses,
        commissionRate: row.commissionRate,
        due: addWeeks(state.date, 10),
        paid: false,
      });
    }
  }
  if (production && waterfall.agencyProfit !== 0) {
    const chunks = splitAmount(Math.abs(waterfall.agencyProfit), 3);
    const sign = waterfall.agencyProfit < 0 ? -1 : 1;
    chunks.forEach((amount, index) => {
      if (amount <= 0) return;
      state.payouts!.push({
        id: nextId(state, "pay"),
        projectId: project.id,
        personId: 0,
        name: state.agency.name,
        kind: "profit",
        amount: amount * sign,
        commissionRate: 0,
        due: addWeeks(state.date, [1, 12, 30][index] ?? 12),
        paid: false,
      });
    });
  }
  if (production?.plan === "loan") {
    const owed = waterfall.loanPay;
    for (const loan of state.loans!) {
      if (loan.productionId !== production.id || owed <= 0) continue;
      const pay = Math.min(loan.balance, owed);
      loan.balance -= pay;
    }
  }
}

/** Backend, as a number: bump when the way backend is paid changes and old saves need re-running. */
export const BACKEND_MODEL = 2;
const MIGRATION_WEEKS = 104;

/**
 * Brings films released in the last two years onto the weekly backend rules.
 * What a client has already been paid is kept. Anything still unpaid is replaced by the weekly
 * schedule, and weeks that have already gone by are paid as one catch-up. Nothing is clawed back
 * if the old rules paid more. Own-production profit and loan repayments are left alone.
 */
export function migrateBackend(state: GameState): void {
  if ((state.backendModel ?? 1) >= BACKEND_MODEL) return;
  lists(state);
  const earliest = addWeeks(state.date, -MIGRATION_WEEKS);
  let films = 0;
  let catchUp = 0;
  let scheduled = 0;
  for (const project of state.projects) {
    if (project.kind !== "film" || project.cancelled || project.historical) continue;
    if (cmpDate(project.release, state.date) > 0 || cmpDate(project.release, earliest) < 0) continue;
    if (!project.totalGross && !project.domesticTotal) continue;
    const backendMembers = project.cast.filter((member) => member.backend > 0 && (member.backendStyle ?? "box_office") !== "none");
    if (!backendMembers.length) continue;
    const before = state.payouts!.filter((row) => row.projectId === project.id);
    const { input } = waterfallFor(state, project);
    const hadPayouts = before.length > 0;
    const talent = input.talent.map((row) => ({ ...row, isPlayerClient: row.isPlayerClient || before.some((payout) => payout.personId === row.personId) }));
    const waterfall = runWaterfall({ ...input, talent });
    let touched = false;
    for (const row of waterfall.talent) {
      if (!row.isPlayerClient) continue;
      const member = project.cast.find((item) => item.personId === row.personId);
      if (!member || member.backend <= 0 || (member.backendStyle ?? "box_office") === "none") continue;
      const mine = before.filter((payout) => payout.kind === "backend" && payout.personId === row.personId);
      const rate = mine[0]?.commissionRate ?? row.commissionRate;
      const legacyCommission = state.ledger
        .filter((entry) => entry.label === `Backend points · ${row.name} · ${project.title}`)
        .reduce((sum, entry) => sum + entry.amount, 0);
      const paid =
        mine.filter((payout) => payout.paid).reduce((sum, payout) => sum + payout.amount, 0) +
        (rate > 0 ? Math.round((legacyCommission * 100) / rate) : 0);
      state.payouts = state.payouts!.filter((payout) => !(payout.projectId === project.id && payout.kind === "backend" && payout.personId === row.personId && !payout.paid));
      const plan = planBackend(state, project, input, row, project.release, paid);
      for (const step of plan) {
        state.payouts.push({
          id: nextId(state, "pay"),
          projectId: project.id,
          personId: row.personId,
          name: row.name,
          kind: "backend",
          amount: step.amount,
          commissionRate: rate,
          due: step.due,
          paid: false,
        });
        const commission = Math.round((step.amount * rate) / 100);
        if (cmpDate(step.due, state.date) <= 0) catchUp += commission;
        else scheduled += 1;
        touched = true;
      }
      if (!hadPayouts && row.bonuses > 0) {
        state.payouts.push({
          id: nextId(state, "pay"),
          projectId: project.id,
          personId: row.personId,
          name: row.name,
          kind: "bonus",
          amount: row.bonuses,
          commissionRate: rate,
          due: cmpDate(addWeeks(project.release, 10), state.date) > 0 ? addWeeks(project.release, 10) : { ...state.date },
          paid: false,
        });
        touched = true;
      }
    }
    if (touched) films += 1;
  }
  state.backendModel = BACKEND_MODEL;
  if (films === 0) return;
  note(
    state,
    `Backend recalculated on ${films} recent film${films === 1 ? "" : "s"}`,
    `Backend now pays week by week as a film earns, and box-office points pay on rentals. Films from the last two years were re-run. ${catchUp > 0 ? `Commission already owed, about $${catchUp.toLocaleString("en-US")}, lands next week. ` : ""}${scheduled > 0 ? `${scheduled} more weekly payment${scheduled === 1 ? "" : "s"} are scheduled.` : "Nothing more is scheduled."}`,
    "/finance",
  );
}

export function applySleeper(state: GameState, project: Project): void {
  if (project.kind !== "film" || project.sleeper) return;
  const production = state.productions?.find((row) => row.projectId === project.id);
  const concept = production?.concepts[production.conceptIndex ?? -1];
  const audience = project.audienceScore ?? project.scriptQuality;
  const hook = concept?.hook ?? Math.round((project.scriptQuality + audience) / 2);
  const rng = sideRng(state, 640 + saltOf(project.id));
  const roll = rollViral(rng, {
    tier: project.budgetTier,
    genre: project.genres[0] ?? "Drama",
    hook,
    directorAcclaim: project.directorAcclaim,
    audience: project.audienceScore ?? 50,
  });
  if (!roll.hit) return;
  const curve = sleeperWeeks(project.budget, roll.multiple);
  project.sleeper = true;
  project.weeklyGross = curve.weekly;
  project.openingWeekend = curve.weekly[0];
  project.domesticTotal = curve.domestic;
  project.internationalTotal = curve.international;
  project.totalGross = curve.total;
  project.profitLabel = profitLabelFor(curve.total, project.budget, project.marketing);
  project.resultWhy = {
    ...(project.resultWhy ?? { opening: "", critic: "", audience: "", profit: "" }),
    opening: "Word of mouth turned the opening into a climb. Later weeks outgrossed the first.",
    profit: `Sleeper hit. About ${roll.multiple.toFixed(0)} times the budget.`,
  };
  if (production) production.hookRevealed = true;
  for (const member of project.cast) {
    const client = state.clients.find((row) => row.personId === member.personId);
    if (!client) continue;
    client.stats.buzz = clamp(client.stats.buzz + 14, 1, 99);
    client.filmStar = clamp(client.filmStar + (member.role === "Lead" || member.role === "Co-lead" ? 8 : 3), 1, 99);
    client.statWhy.buzz = `${project.title} broke out from almost nothing. Buzz jumped.`;
  }
  state.news.unshift({
    id: `news_${++state.seq}`,
    date: { ...state.date },
    headline: `${project.title} is a sleeper hit`,
    body: `A ${project.budgetTier} ${project.genres[0] ?? "film"} with no franchise behind it is growing week to week.`,
  });
  note(state, `${project.title} is a sleeper hit`, "The gross is climbing instead of falling. Fame and buzz moved for the cast.", `/projects/${project.id}`);
}

export function settlePayouts(state: GameState): void {
  lists(state);
  for (const payout of state.payouts!) {
    if (payout.paid || cmpDate(payout.due, state.date) > 0) continue;
    const project = state.projects.find((row) => row.id === payout.projectId);
    const title = project?.title ?? "a film";
    if (payout.kind === "profit") {
      book(state, payout.amount, `Own-production profit · ${title}`, "production");
    } else {
      const commission = Math.round(payout.amount * payout.commissionRate / 100);
      const bucket = payout.kind === "bonus" ? "bonus" : "backend";
      const label = payout.kind === "bonus" ? "Bonus commission" : "Backend commission";
      if (commission !== 0) book(state, commission, `${label} · ${payout.name} · ${title}`, bucket);
    }
    payout.paid = true;
  }
}

export function serviceLoans(state: GameState): void {
  lists(state);
  for (const loan of state.loans!) {
    if (loan.balance <= 0) continue;
    const production = loan.productionId ? state.productions!.find((row) => row.id === loan.productionId) : undefined;
    const interestOnly = Boolean(production && production.stage === "financed" && !loan.emergency);
    if (interestOnly) {
      const interest = Math.round(loan.balance * loan.annualRate / 52);
      if (interest > 0) book(state, -interest, `${loan.label} interest`, "production");
      continue;
    }
    const week = loanWeek(loan);
    if (week.payment <= 0) continue;
    book(state, -week.payment, `${loan.label} payment`, "production");
    loan.balance = week.balance;
  }
}

function awardBonuses(state: GameState): void {
  lists(state);
  for (const project of state.projects) {
    for (const member of project.cast) {
      for (const bonus of member.bonuses ?? []) {
        if ((bonus.kind ?? "gross") !== "awards" || bonus.paid) continue;
        const client = state.clients.find((row) => row.personId === member.personId);
        const won = client?.awards.some((award) => award.result === "won" && award.projectTitle === project.title);
        if (!won) continue;
        bonus.paid = true;
        state.payouts!.push({
          id: nextId(state, "pay"),
          projectId: project.id,
          personId: member.personId,
          name: member.name,
          kind: "bonus",
          amount: bonus.amount,
          commissionRate: client?.contract?.commission ?? 10,
          due: { ...state.date },
          paid: false,
        });
      }
    }
  }
}

function tickProduction(state: GameState, production: Production): void {
  if (production.stage !== "financed" || !production.projectId) return;
  const project = state.projects.find((row) => row.id === production.projectId);
  if (!project || project.ended || project.cancelled) return;
  const concept = production.concepts[production.conceptIndex ?? 0];
  const wrap = addWeeks(project.shootStart, project.shootWeeks);
  const inShoot = cmpDate(state.date, project.shootStart) >= 0 && cmpDate(state.date, wrap) <= 0;
  if (inShoot) {
    const rng = sideRng(state, 700 + saltOf(production.id) + state.date.week);
    if (chance(rng, 0.16)) {
      const kind = int(rng, 0, 3);
      if (kind === 0) {
        project.shootWeeks += 1;
        project.release = addWeeks(project.release, 1);
        production.shootWeeks += 1;
        production.events.push({ date: { ...state.date }, title: "Delay", body: `${project.title} loses a week. The release moves with it.` });
      } else if (kind === 1) {
        const extra = Math.max(5_000, Math.round(project.budget * 0.06));
        project.budget += extra;
        production.budget += extra;
        book(state, -extra, `Overrun · ${project.title}`, "production");
        production.events.push({ date: { ...state.date }, title: "Overrun", body: `The shoot spent an extra $${extra.toLocaleString("en-US")}.` });
      } else if (kind === 2 && project.cast[0]) {
        const client = state.clients.find((row) => row.personId === project.cast[0]!.personId && row.agency === "player");
        if (client) client.loyalty = clamp(client.loyalty - 4, 1, 99);
        project.shootWeeks += 1;
        project.release = addWeeks(project.release, 1);
        production.events.push({ date: { ...state.date }, title: "Injury", body: `${project.cast[0]!.name} is hurt. The week is lost and the mood on set drops.` });
      } else if (concept) {
        project.scriptQuality = clamp(project.scriptQuality + 6, 1, 99);
        concept.hook = clamp(concept.hook + 4, 1, 99);
        production.hookRevealed = true;
        production.events.push({ date: { ...state.date }, title: "Test screening", body: `A test of ${project.title} played. Hook ${concept.hook}. The cut got better.` });
      }
    }
  }
  if (production.distribution === "undecided" && cmpDate(state.date, addWeeks(project.release, -4)) >= 0) {
    production.distribution = "theatrical";
    note(state, `${project.title} needs a release plan`, "No buyer was chosen, so it goes out theatrically at the posted distributor fee.", `/productions/${production.id}`);
  }
}

export function advanceMoney(state: GameState): void {
  lists(state);
  serviceLoans(state);
  tickProductions(state);
  awardBonuses(state);
  settlePayouts(state);
}

function tickProductions(state: GameState): void {
  for (const production of state.productions ?? []) tickProduction(state, production);
}

export function resolveInsolvency(state: GameState): void {
  lists(state);
  if (state.gameOver) return;
  if (state.agency.cash >= 0) {
    state.insolventWeeks = 0;
    return;
  }
  state.insolventWeeks += 1;
  if (state.insolventWeeks === 1 || state.insolventWeeks % 4 === 0) {
    note(state, "The agency is in the red", cashWarning(state) ?? "Cash is negative. Sell a finished picture or take the emergency loan.", "/finance");
  }
  if (state.insolventWeeks === 4) {
    const library = state.productions!.find((row) => row.stage === "released" && !row.librarySold && row.projectId);
    const project = library ? state.projects.find((row) => row.id === library.projectId) : undefined;
    if (library && project) {
      const price = Math.max(10_000, Math.round(project.budget * 0.25));
      book(state, price, `Forced library sale · ${project.title}`, "production");
      library.librarySold = true;
      note(state, `Sold ${project.title} to cover the hole`, `The library went for $${price.toLocaleString("en-US")}.`, "/finance");
    }
  }
  if (state.agency.cash < 0 && state.insolventWeeks >= 4) {
    const emergencies = state.loans!.filter((loan) => loan.emergency);
    if (emergencies.length < 2) {
      const principal = Math.max(80_000, -state.agency.cash + weeklyOverhead(state) * 10);
      state.loans!.push({
        id: nextId(state, "loan"),
        productionId: null,
        label: "Emergency loan",
        principal,
        balance: principal,
        annualRate: 0.28,
        emergency: true,
      });
      book(state, principal, "Emergency loan", "production");
      note(state, "The bank wrote an emergency loan", `$${principal.toLocaleString("en-US")} at 28% a year. A second hole closes the agency.`, "/finance");
    }
  }
  if (state.agency.cash < 0 && state.insolventWeeks >= 10) {
    state.gameOver = true;
    note(state, "The agency is closed", "Cash stayed negative after a library sale and two emergency loans.", "/finance");
  }
}

export function marketFee(client: Pick<Client, "fame" | "filmStar">, role: RoleType, tier: BudgetTier, genre: string): number {
  return upfrontFee({ fame: client.fame, role, tier, filmStar: client.filmStar, genre });
}

export function previewCost(production: Production) {
  const cast = production.cast.reduce((sum, member) => sum + member.fee, 0);
  const marketing = production.marketing || Math.round(((BUDGETS[production.tier].min + BUDGETS[production.tier].max) / 2) * BUDGETS[production.tier].marketing);
  return packageCost({ tier: production.tier, cast, director: production.directorFee, marketing: production.stage === "financed" ? production.marketing : marketing });
}
