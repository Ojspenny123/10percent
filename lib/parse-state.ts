import type { GameState } from "@/engine/types";

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
  for (const approach of state.approaches) {
    const desired = approach.desiredCommission || approach.ask?.commission || 10;
    const ask = approach.ask?.commission
      ? approach.ask
      : { commission: desired, termYears: 2, exclusive: true, exitClause: true };
    approach.ask = {
      commission: ask.commission,
      termYears: ask.termYears || 2,
      exclusive: ask.exclusive !== false,
      exitClause: ask.exitClause !== false,
    };
    approach.desiredCommission = approach.ask.commission;
    approach.opening = approach.opening?.commission ? approach.opening : { ...approach.ask };
    approach.line = approach.line || approach.pitch || `${approach.name} asked for a meeting.`;
    approach.pitch = approach.pitch || approach.line;
    approach.walkAwayCommission = approach.walkAwayCommission || Math.min(20, approach.ask.commission + 2);
  }
  for (const item of state.inbox) {
    item.resolved ??= false;
    item.read ??= false;
    if (item.kind === "approach" && (!item.href || item.href === "/dashboard")) {
      const match = state.approaches.find((approach) => item.refId === approach.id || item.title.startsWith(`${approach.name} wants`));
      if (match) {
        item.href = `/meetings/${match.id}`;
        item.refId ??= match.id;
      }
    }
    if (item.kind === "offer" && item.href === "/offers" && item.refId) item.href = `/offers?offer=${item.refId}`;
    if (item.kind === "event" && (!item.href || item.href === "/dashboard")) {
      const event = state.events.find((row) => row.id === item.refId || (row.title === item.title && !row.resolved));
      if (event) {
        item.href = `/dashboard#event-${event.id}`;
        item.refId ??= event.id;
      }
    }
    if (item.kind === "money" && (!item.href || item.href === "/agency")) {
      const deal = state.brandDeals.find((row) => item.refId === row.id || (item.title.includes(row.brand) && row.status === "offered"));
      if (deal) {
        item.href = `/agency#brand-${deal.id}`;
        item.refId ??= deal.id;
      }
    }
    if (item.kind === "award" && !item.href) item.href = "/awards";
    if (item.kind === "news" && !item.href) item.href = "/news";
  }
  for (const project of state.projects) {
    project.commissionsPaid ??= [];
    project.reviews ??= [];
    project.weeklyGross ??= [];
    project.seasons ??= [];
    project.cast ??= [];
  }
  return state;
}
