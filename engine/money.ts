import { BUDGETS, STAFF_INFO } from "./constants";
import { expectedFee } from "./people";
import { absWeek } from "./schedule";
import type { RngState } from "./rng";
import { chance, next } from "./rng";
import type {
  BackendStyle,
  BoxBonus,
  BudgetTier,
  FameTier,
  GameState,
  RoleType,
  WaterfallLine,
} from "./types";

function roundMoney(n: number): number {
  return Math.round(n);
}

const GENRE_FEE: Record<string, number> = {
  Horror: 0.96,
  Documentary: 0.94,
  Superhero: 1.06,
  Action: 1.04,
  Animation: 1.03,
  Biopic: 0.97,
  Drama: 0.98,
  Thriller: 0.97,
  Comedy: 1,
};

export function upfrontFee(input: {
  fame: FameTier;
  role: RoleType;
  tier: BudgetTier;
  filmStar: number;
  genre: string;
}): number {
  const base = expectedFee(input.fame, input.role, input.tier);
  const genre = GENRE_FEE[input.genre] ?? 1;
  const star = 0.94 + Math.max(1, Math.min(99, input.filmStar)) / 900;
  const raw = base * genre * star;
  const lead = input.role === "Lead" || input.role === "Co-lead";
  let fee = raw;
  if (lead && (input.fame === "Working" || input.fame === "Known")) fee = Math.min(1_500_000, Math.max(50_000, fee));
  if (lead && input.fame === "A-list" && (input.tier === "mid" || input.tier === "studio" || input.tier === "tentpole")) {
    fee = Math.min(25_000_000, Math.max(5_000_000, fee));
  }
  if (lead && input.fame === "Icon" && (input.tier === "studio" || input.tier === "tentpole")) {
    fee = Math.min(65_000_000, Math.max(20_000_000, fee));
  }
  if (lead && (input.fame === "A-list" || input.fame === "Icon") && (input.tier === "micro-indie" || input.tier === "indie")) {
    const cap = input.fame === "Icon" ? 8_000_000 : 4_000_000;
    fee = Math.min(cap, fee);
  }
  return Math.max(5_000, roundMoney(fee / 1000) * 1000);
}

export function quotePackage(input: {
  fame: FameTier;
  role: RoleType;
  tier: BudgetTier;
  filmStar: number;
  genre: string;
}): {
  fee: number;
  style: BackendStyle;
  points: number;
  bonuses: BoxBonus[];
  low: number;
  high: number;
  why: string;
} {
  const fee = upfrontFee(input);
  const lead = input.role === "Lead" || input.role === "Co-lead";
  const star = input.fame === "A-list" || input.fame === "Icon";
  let style: BackendStyle = "none";
  let points = 0;
  if (star && lead) {
    if (input.tier === "micro-indie" || input.tier === "indie") {
      style = "net";
      points = input.fame === "Icon" ? 4 : 3;
    } else if ((input.fame === "Icon" || input.filmStar >= 82) && (input.tier === "studio" || input.tier === "tentpole")) {
      style = "first_dollar";
      points = input.fame === "Icon" ? 8 + Math.round(input.filmStar / 50) : 6;
    } else if (input.tier === "studio" || input.tier === "tentpole" || input.tier === "mid") {
      style = "box_office";
      points = input.fame === "Icon" ? 6 : 5;
      if (input.tier === "mid") points = Math.max(2, points - 3);
    }
  }
  const bonuses: BoxBonus[] = [];
  if (star && lead && input.tier !== "micro-indie") {
    bonuses.push({ multiple: 2, amount: roundMoney(fee * 0.1), kind: "gross" });
    bonuses.push({ multiple: 3, amount: roundMoney(fee * 0.15), kind: "gross" });
    bonuses.push({ multiple: 0, amount: roundMoney(fee * 0.08), kind: "awards" });
  }
  const spec = BUDGETS[input.tier];
  const hitGross = spec.max * (input.tier === "micro-indie" ? 8 : input.tier === "indie" ? 4 : input.tier === "tentpole" ? 2.4 : 3);
  const participation = style === "net" ? fee * (points / 20) : hitGross * (points / 100);
  const bonusSum = bonuses.filter((bonus) => bonus.kind !== "awards").reduce((sum, bonus) => sum + bonus.amount, 0);
  const high = fee + roundMoney(participation) + bonusSum;
  const styleLine =
    style === "first_dollar"
      ? `${points} first-dollar points on theatrical rentals, paid before the budget is recouped`
      : style === "box_office"
        ? `${points} points of box office, paid from profit after costs`
        : style === "net"
          ? `${points} net points after the film recoups`
          : "no backend";
  return {
    fee,
    style,
    points,
    bonuses,
    low: fee,
    high,
    why: `${input.fame} ${input.role} on a ${input.tier} ${input.genre} package. Upfront ${styleLine}. Indie and micro work pays a fraction of the commercial quote and keeps the awards path open.`,
  };
}

export type WaterfallTalent = {
  personId: number;
  name: string;
  upfront: number;
  style: BackendStyle;
  points: number;
  bonuses: BoxBonus[];
  isPlayerClient: boolean;
  commissionRate: number;
};

export type WaterfallResult = {
  lines: WaterfallLine[];
  exhibitor: number;
  rentals: number;
  distributorFee: number;
  streamingNet: number;
  pool: number;
  investorTake: number;
  loanPay: number;
  talent: { personId: number; name: string; backend: number; bonuses: number; isPlayerClient: boolean; commissionRate: number }[];
  agencyProfit: number;
  multiple: number;
};

export function streamingIncome(input: {
  budget: number;
  tier: BudgetTier;
  genre: string;
  critic: number;
  audience: number;
  hook: number;
}): number {
  const quality = (input.critic * 0.5 + input.audience * 0.35 + input.hook * 0.15) / 100;
  const genreBoost = input.genre === "Horror" || input.genre === "Thriller" ? 1.2 : input.genre === "Action" || input.genre === "Superhero" ? 1.12 : input.genre === "Documentary" ? 0.55 : 0.9;
  const tier = input.tier === "micro-indie" ? 0.45 : input.tier === "indie" ? 0.32 : input.tier === "tentpole" ? 0.18 : 0.24;
  return roundMoney(input.budget * tier * (0.35 + quality) * genreBoost);
}

export function runWaterfall(input: {
  domestic: number;
  international: number;
  streaming: number;
  budget: number;
  marketing: number;
  distributorRate: number;
  investorShare: number;
  loanBalance: number;
  talent: WaterfallTalent[];
  /** A pre-sale ignores the exhibitor split and treats the price as rentals. */
  sale?: number;
}): WaterfallResult {
  const lines: WaterfallLine[] = [];
  const domestic = Math.max(0, input.domestic);
  const international = Math.max(0, input.international);
  const gross = input.sale != null ? input.sale : domestic + international;
  const exhibitor = input.sale != null ? 0 : roundMoney(domestic * 0.5 + international * 0.4);
  const theatricalRentals = input.sale != null ? roundMoney(input.sale) : gross - exhibitor;
  const streamingNet = input.sale != null ? 0 : roundMoney(Math.max(0, input.streaming) * 0.8);
  const distributorFee = input.sale != null ? 0 : roundMoney(theatricalRentals * input.distributorRate);
  const rentals = theatricalRentals + streamingNet;
  lines.push({
    label: input.sale != null ? "Sale price" : "Gross box office",
    amount: gross,
    note: input.sale != null ? "Fixed sale. No exhibitor split." : `Domestic ${domestic.toLocaleString("en-US")} plus international ${international.toLocaleString("en-US")}.`,
  });
  if (input.sale == null) {
    lines.push({
      label: "Exhibitor share",
      amount: -exhibitor,
      note: "About half of domestic theatrical, and a lower 40% of international.",
    });
  }
  lines.push({
    label: "Distributor fee",
    amount: -distributorFee,
    note: `${Math.round(input.distributorRate * 100)}% of theatrical rentals. Streaming keeps a separate 20% platform fee.`,
  });
  if (streamingNet > 0) {
    lines.push({ label: "Streaming and home entertainment", amount: streamingNet, note: "After the platform fee, from quality and genre." });
  }

  let pot = theatricalRentals - distributorFee + streamingNet;
  const talentPay = input.talent.map((row) => ({
    personId: row.personId,
    name: row.name,
    backend: 0,
    bonuses: 0,
    isPlayerClient: row.isPlayerClient,
    commissionRate: row.commissionRate,
  }));

  let firstDollar = 0;
  input.talent.forEach((row, index) => {
    if (row.style !== "first_dollar" || row.points <= 0) return;
    const pay = roundMoney(theatricalRentals * (row.points / 100));
    talentPay[index]!.backend += pay;
    firstDollar += pay;
  });
  if (firstDollar > 0) {
    lines.push({ label: "First-dollar participations", amount: -firstDollar, note: "Paid from theatrical rentals before the budget is recouped." });
    pot -= firstDollar;
  }

  const marketing = Math.max(0, input.marketing);
  const budget = Math.max(0, input.budget);
  lines.push({ label: "Marketing and P&A", amount: -marketing, note: "Recouped before production cost." });
  pot -= marketing;
  lines.push({ label: "Production cost", amount: -budget, note: "Negative cost, cast, director, crew, and contingency." });
  pot -= budget;

  const profitStart = pot;
  const loanPay = profitStart > 0 ? Math.min(Math.max(0, input.loanBalance), roundMoney(profitStart)) : 0;
  pot = profitStart - loanPay;
  if (loanPay > 0) lines.push({ label: "Loan repayment", amount: -loanPay, note: "Principal still outstanding on this picture." });

  const investorTake = pot > 0 ? roundMoney(pot * Math.max(0, Math.min(0.8, input.investorShare))) : 0;
  pot -= investorTake;
  if (investorTake > 0) lines.push({ label: "Investor share", amount: -investorTake, note: `${Math.round(input.investorShare * 100)}% of profit after recoup.` });

  const cost = budget + marketing;
  let bonusOwed = 0;
  input.talent.forEach((row, index) => {
    for (const bonus of row.bonuses) {
      if ((bonus.kind ?? "gross") === "awards") continue;
      if (bonus.multiple > 0 && gross < cost * bonus.multiple) continue;
      const pay = roundMoney(bonus.amount);
      talentPay[index]!.bonuses += pay;
      bonusOwed += pay;
    }
  });
  const bonusPaid = pot > 0 ? Math.min(pot, bonusOwed) : 0;
  if (bonusOwed > bonusPaid && bonusPaid > 0 && bonusOwed > 0) {
    const scale = bonusPaid / bonusOwed;
    for (const row of talentPay) row.bonuses = roundMoney(row.bonuses * scale);
  }
  if (bonusPaid === 0) for (const row of talentPay) row.bonuses = 0;
  pot -= bonusPaid;
  if (bonusPaid > 0) lines.push({ label: "Box-office bonuses", amount: -bonusPaid, note: "2x and 3x thresholds, capped by cash left in the waterfall." });

  let participation = 0;
  const claims = input.talent.map((row) => {
    if (row.style === "box_office") return roundMoney(gross * (row.points / 100));
    if (row.style === "net") return roundMoney(Math.max(0, pot) * (row.points / 100));
    return 0;
  });
  const claimSum = claims.reduce((sum, n) => sum + n, 0);
  const paySum = pot > 0 ? Math.min(pot, claimSum) : 0;
  if (paySum > 0 && claimSum > 0) {
    const scale = paySum / claimSum;
    claims.forEach((claim, index) => {
      const pay = roundMoney(claim * scale);
      talentPay[index]!.backend += pay;
      participation += pay;
    });
  }
  pot -= participation;
  if (participation > 0) lines.push({ label: "Talent backend", amount: -participation, note: "Box-office points and net points from what remains." });

  const agencyProfit = roundMoney(pot);
  lines.push({
    label: "Agency profit",
    amount: agencyProfit,
    note: agencyProfit >= 0 ? "What is left after the waterfall. Commission on client fees is separate." : "The picture lost money. Nothing is left for the agency.",
  });

  return {
    lines,
    exhibitor,
    rentals,
    distributorFee,
    streamingNet,
    pool: Math.max(0, profitStart),
    investorTake,
    loanPay,
    talent: talentPay,
    agencyProfit,
    multiple: gross / Math.max(1, cost),
  };
}

const VIRAL_GENRES = new Set(["Horror", "Thriller", "Mystery", "Sci-Fi", "Fantasy"]);

export function viralOdds(input: { tier: BudgetTier; genre: string; hook: number; directorAcclaim: number; audience: number }): number {
  if (input.tier !== "micro-indie" && input.tier !== "indie") return 0;
  let odds = input.tier === "micro-indie" ? 0.028 : 0.02;
  if (input.hook >= 70) odds += 0.012;
  if (input.hook >= 85) odds += 0.008;
  if (VIRAL_GENRES.has(input.genre)) odds += 0.01;
  if (input.directorAcclaim >= 70) odds += 0.006;
  if (input.audience >= 78) odds += 0.008;
  return Math.min(0.075, odds);
}

export function rollViral(rng: RngState, input: { tier: BudgetTier; genre: string; hook: number; directorAcclaim: number; audience: number }): { hit: boolean; multiple: number } {
  const odds = viralOdds(input);
  if (odds <= 0 || !chance(rng, odds)) return { hit: false, multiple: 0 };
  const multiple = 20 + next(rng) * 80;
  return { hit: true, multiple };
}

export function sleeperWeeks(budget: number, multiple: number): { weekly: number[]; domestic: number; international: number; total: number } {
  const total = roundMoney(Math.max(1, budget) * multiple);
  const domesticTarget = roundMoney(total * 0.62);
  const weights = [0.06, 0.1, 0.16, 0.22, 0.16, 0.12, 0.1, 0.08];
  const weekly = weights.map((weight) => roundMoney(domesticTarget * weight));
  const domestic = weekly.reduce((sum, n) => sum + n, 0);
  return { weekly, domestic, international: total - domestic, total };
}

export function payLoyalty(market: number, offered: number): { delta: number; line: string } {
  if (market <= 0) return { delta: 0, line: "No market quote to compare." };
  const ratio = offered / market;
  if (ratio < 0.75) return { delta: -14, line: "This is well under market. Loyalty will drop, and they may walk." };
  if (ratio < 0.9) return { delta: -6, line: "Light for your own client. Expect a loyalty hit." };
  if (ratio > 1.35) return { delta: 10, line: "Generous against market. Loyalty rises." };
  if (ratio > 1.1) return { delta: 4, line: "A little above market. They will notice." };
  return { delta: 0, line: "Close to market. Loyalty stays put." };
}

export function loanWeek(loan: { balance: number; principal: number; annualRate: number }): { interest: number; principalPay: number; payment: number; balance: number } {
  if (loan.balance <= 0) return { interest: 0, principalPay: 0, payment: 0, balance: 0 };
  const interest = roundMoney(loan.balance * loan.annualRate / 52);
  const principalPay = Math.min(loan.balance, Math.max(1, roundMoney(loan.principal / 52)));
  return { interest, principalPay, payment: interest + principalPay, balance: loan.balance - principalPay };
}

export function weeklyOverhead(state: GameState): number {
  const salaries = state.agency.staff.reduce((sum, member) => sum + STAFF_INFO[member.role].weekly * member.level, 0);
  const named = (state.agents ?? []).reduce((sum, row) => sum + row.salary, 0)
    + (state.publicists ?? []).reduce((sum, row) => sum + row.salary, 0)
    + (state.executives ?? []).reduce((sum, row) => sum + row.salary, 0);
  return roundMoney(state.agency.rent / 4 + salaries + named);
}

export function cashWarning(state: GameState): string | null {
  if (state.gameOver) return "The agency is closed. Cash ran out and the emergency loans could not cover it.";
  const overhead = weeklyOverhead(state) * 8;
  const debt = (state.loans ?? []).reduce((sum, loan) => {
    const week = loanWeek(loan);
    return sum + week.payment * 8;
  }, 0);
  const incoming = (state.payouts ?? []).filter((payout) => !payout.paid).reduce((sum, payout) => {
    const weeks = absWeek(payout.due) - absWeek(state.date);
    if (weeks < 0 || weeks > 8) return sum;
    if (payout.kind === "profit") return sum + payout.amount;
    return sum + roundMoney(payout.amount * payout.commissionRate / 100);
  }, 0);
  if (state.agency.cash + incoming < overhead + debt) {
    return "Payroll, rent, and loan payments over the next eight weeks are ahead of cash and backend already on the calendar.";
  }
  if (state.insolventWeeks > 0) return "Cash is negative. Sell a finished picture or take the emergency loan before the agency closes.";
  return null;
}

export function netWorth(state: GameState): { cash: number; receivables: number; debt: number; total: number } {
  const receivables = (state.payouts ?? []).filter((payout) => !payout.paid).reduce((sum, payout) => {
    if (payout.kind === "profit") return sum + payout.amount;
    return sum + roundMoney(payout.amount * payout.commissionRate / 100);
  }, 0);
  const debt = (state.loans ?? []).reduce((sum, loan) => sum + loan.balance, 0);
  return { cash: state.agency.cash, receivables, debt, total: state.agency.cash + receivables - debt };
}

export function incomeTimeline(state: GameState): { label: string; upfront: number; backend: number; bonus: number; series: number; production: number }[] {
  const buckets = new Map<number, { upfront: number; backend: number; bonus: number; series: number; production: number }>();
  for (const entry of state.ledger) {
    if (entry.amount === 0) continue;
    const key = Math.floor(absWeek(entry.date) / 4);
    const row = buckets.get(key) ?? { upfront: 0, backend: 0, bonus: 0, series: 0, production: 0 };
    const bucket = entry.bucket ?? "other";
    if (bucket === "film") row.upfront += entry.amount;
    else if (bucket === "backend") row.backend += entry.amount;
    else if (bucket === "bonus") row.bonus += entry.amount;
    else if (bucket === "series" || bucket === "pilot") row.series += entry.amount;
    else if (bucket === "production") row.production += entry.amount;
    buckets.set(key, row);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-8)
    .map(([key, row]) => ({ label: `W${key * 4}`, ...row }));
}

export function packageCost(input: { tier: BudgetTier; cast: number; director: number; marketing: number }): {
  cast: number;
  director: number;
  crew: number;
  production: number;
  marketing: number;
  contingency: number;
  total: number;
  inflated: boolean;
} {
  const spec = BUDGETS[input.tier];
  let target = roundMoney((spec.min + spec.max) / 2);
  const above = input.cast + input.director;
  let inflated = false;
  if (above > target * 0.62) {
    target = roundMoney(above / 0.55);
    inflated = true;
  }
  const contingency = roundMoney(target * 0.08);
  const marketing = Math.max(0, input.marketing);
  const rest = Math.max(0, target - above - contingency);
  const crew = roundMoney(rest * 0.42);
  const production = rest - crew;
  const total = above + crew + production + contingency + marketing;
  return { cast: input.cast, director: input.director, crew, production, marketing, contingency, total, inflated };
}
