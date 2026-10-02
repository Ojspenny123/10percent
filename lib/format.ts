import { MONTHS } from "@/engine/constants";
import type { GameDate } from "@/engine/types";

export function money(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 10_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function viewers(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1000)}K`;
  return Math.round(value).toLocaleString("en-US");
}

export function formatDate(date: GameDate): string {
  const month = MONTHS[Math.min(11, Math.floor(((date.week - 1) * 12) / 52))] ?? "January";
  return `${month} ${date.year} · Week ${date.week}`;
}

export function billingLabel(billing: number): string {
  if (billing === 1) return "Top billing";
  if (billing === 2) return "Second";
  if (billing === 3) return "Third";
  return `${billing}th`;
}

export function pct(value: number): string {
  return `${Math.round(value)}`;
}

export function backendLabel(style: string | undefined, points: number): string {
  if (!style || style === "none" || points <= 0) return "No backend";
  if (style === "first_dollar") return `${points} first-dollar pts`;
  if (style === "net") return `${points} net pts`;
  return `${points} pts of box office`;
}
