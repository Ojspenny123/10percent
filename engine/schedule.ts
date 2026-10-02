import { CEREMONIES, MONTHS } from "./constants";
import type { Client, GameDate, GameState, Hold, Project, WorkStatus } from "./types";

export function absWeek(date: GameDate): number {
  return date.year * 52 + (date.week - 1);
}

export function fromAbs(n: number): GameDate {
  const year = Math.floor(n / 52);
  const week = (n % 52) + 1;
  return { year, week };
}

export function addWeeks(date: GameDate, weeks: number): GameDate {
  return fromAbs(absWeek(date) + weeks);
}

export function cmpDate(a: GameDate, b: GameDate): number {
  return absWeek(a) - absWeek(b);
}

export function formatDate(date: GameDate): string {
  const month = MONTHS[Math.min(11, Math.floor(((date.week - 1) * 12) / 52))] ?? "January";
  return `${month} ${date.year} · Week ${date.week}`;
}

export function sameDate(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.week === b.week;
}

export type Interval = { start: number; end: number; projectId: string; kind: "block" | "soft" };

export function shootEnd(project: { shootStart: GameDate; shootWeeks: number }): GameDate {
  return addWeeks(project.shootStart, Math.max(1, project.shootWeeks) - 1);
}

export function blockingIntervals(project: Project): Interval[] {
  if (project.cancelled) return [];
  if (project.kind === "series" && project.seasons.length > 0) {
    return project.seasons
      .filter((season) => season.renewal !== "cancelled")
      .map((season) => ({
        start: absWeek(season.prepStart),
        end: absWeek(addWeeks(season.shootStart, Math.max(1, season.shootWeeks) - 1)),
        projectId: project.id,
        kind: "block" as const,
      }));
  }
  if (project.phase === "development" && project.openRole) {
    return [
      {
        start: absWeek(project.prepStart),
        end: absWeek(shootEnd(project)),
        projectId: project.id,
        kind: "block",
      },
    ];
  }
  return [
    {
      start: absWeek(project.prepStart),
      end: absWeek(shootEnd(project)),
      projectId: project.id,
      kind: "block",
    },
  ];
}

export function personBlocks(state: GameState, personId: number, ignoreProjectId?: string): Interval[] {
  const blocks: Interval[] = [];
  for (const project of state.projects) {
    if (project.id === ignoreProjectId || project.cancelled) continue;
    const involved =
      project.cast.some((c) => c.personId === personId && c.active && !c.writtenOut) ||
      project.openRole?.forPersonId === personId;
    if (!involved) continue;
    for (const interval of blockingIntervals(project)) {
      if (project.openRole?.forPersonId === personId || project.cast.some((c) => c.personId === personId && c.active && !c.writtenOut)) {
        blocks.push(interval);
      }
    }
  }
  for (const hold of state.holds) {
    if (hold.personId !== personId) continue;
    blocks.push({ start: absWeek(hold.start), end: absWeek(hold.end), projectId: hold.id, kind: "block" });
  }
  return blocks;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function scheduleConflict(
  state: GameState,
  personId: number,
  prepStart: GameDate,
  shootFinish: GameDate,
  ignoreProjectId?: string,
): { projectId: string; message: string } | null {
  const start = absWeek(prepStart);
  const end = absWeek(shootFinish);
  for (const block of personBlocks(state, personId, ignoreProjectId)) {
    if (!overlaps(start, end, block.start, block.end)) continue;
    const project = state.projects.find((p) => p.id === block.projectId);
    const hold = state.holds.find((h) => h.id === block.projectId);
    if (hold) {
      return {
        projectId: hold.id,
        message: `Schedule conflict: they are on hold (${hold.reason}) from ${formatDate(hold.start)} through ${formatDate(hold.end)}.`,
      };
    }
    const title = project?.title ?? "another project";
    const phase = project ? phaseAt(project, fromAbs(block.start)).label : "prep or shooting";
    return {
      projectId: block.projectId,
      message: `Schedule conflict: ${title} already has them from ${formatDate(fromAbs(block.start))} through ${formatDate(fromAbs(block.end))} (${phase}). An actor can only be on one project during prep and shooting.`,
    };
  }
  return null;
}

export type PhaseView = {
  status: WorkStatus;
  progress: number;
  label: string;
  detail: string;
  weeksRemaining: number;
  projectId?: string;
  title?: string;
};

export function phaseAt(project: Project, date: GameDate): PhaseView {
  const now = absWeek(date);
  if (project.cancelled) {
    return { status: "AVAILABLE", progress: 0, label: "Cancelled", detail: "This one is dead.", weeksRemaining: 0, projectId: project.id, title: project.title };
  }
  if (project.kind === "series" && project.seasons.length > 0) {
    const season = project.seasons[project.seasons.length - 1]!;
    const prep = absWeek(season.prepStart);
    const shootStart = absWeek(season.shootStart);
    const shootFinish = absWeek(addWeeks(season.shootStart, season.shootWeeks - 1));
    const premiere = absWeek(season.premiere);
    if (now < prep) {
      return { status: "AVAILABLE", progress: 0, label: "Booked", detail: `Prep starts ${formatDate(season.prepStart)}`, weeksRemaining: prep - now, projectId: project.id, title: project.title };
    }
    if (now < shootStart) {
      const total = Math.max(1, shootStart - prep);
      const done = now - prep + 1;
      return {
        status: "IN_PREP",
        progress: Math.round((done / total) * 100),
        label: `Week ${done} of ${total} of prep`,
        detail: `Shooting starts ${formatDate(season.shootStart)}`,
        weeksRemaining: shootStart - now,
        projectId: project.id,
        title: project.title,
      };
    }
    if (now <= shootFinish) {
      const total = Math.max(1, season.shootWeeks);
      const done = now - shootStart + 1;
      return {
        status: "SHOOTING",
        progress: Math.round((done / total) * 100),
        label: `Week ${done} of ${total} of shooting`,
        detail: `${project.format ?? "Series"} · season ${season.number}`,
        weeksRemaining: shootFinish - now,
        projectId: project.id,
        title: project.title,
      };
    }
    if (now < premiere) {
      const total = Math.max(1, premiere - shootFinish);
      const done = now - shootFinish;
      return {
        status: "POST_PRODUCTION",
        progress: Math.round((done / total) * 100),
        label: "Post-production",
        detail: `Premiere ${formatDate(season.premiere)}. Does not block new work.`,
        weeksRemaining: premiere - now,
        projectId: project.id,
        title: project.title,
      };
    }
    const airEnd =
      season.schedule === "binge" ? premiere : premiere + Math.max(0, season.episodes - 1);
    if (now <= airEnd && season.renewal !== "cancelled") {
      const aired = Math.min(season.episodes, now - premiere + 1);
      return {
        status: "AIRING",
        progress: Math.round((aired / season.episodes) * 100),
        label: season.schedule === "binge" ? `Binge drop · ${season.episodes} episodes` : `Episode ${aired} of ${season.episodes}`,
        detail: "Airing does not block a new prep or shoot.",
        weeksRemaining: Math.max(0, airEnd - now),
        projectId: project.id,
        title: project.title,
      };
    }
    if (season.renewal === "renewed" || season.renewal === "renewed_short") {
      return { status: "AVAILABLE", progress: 100, label: "Between seasons", detail: "Renewed. Next prep is not on the calendar yet, or it is still ahead.", weeksRemaining: 0, projectId: project.id, title: project.title };
    }
    return { status: "AVAILABLE", progress: 100, label: season.renewal === "finale" ? "Ended" : "Wrapped", detail: project.title, weeksRemaining: 0, projectId: project.id, title: project.title };
  }

  const prep = absWeek(project.prepStart);
  const shootStart = absWeek(project.shootStart);
  const shootFinish = absWeek(shootEnd(project));
  const release = absWeek(project.release);
  if (project.ended || now > release) {
    return { status: "AVAILABLE", progress: 100, label: "Released", detail: formatDate(project.release), weeksRemaining: 0, projectId: project.id, title: project.title };
  }
  if (now < prep) {
    return { status: "AVAILABLE", progress: 0, label: "Booked", detail: `Prep starts ${formatDate(project.prepStart)}`, weeksRemaining: prep - now, projectId: project.id, title: project.title };
  }
  if (now < shootStart) {
    const total = Math.max(1, shootStart - prep);
    const done = now - prep + 1;
    return {
      status: "IN_PREP",
      progress: Math.round((done / total) * 100),
      label: `Week ${done} of ${total} of prep`,
      detail: `Shoot starts ${formatDate(project.shootStart)}`,
      weeksRemaining: shootStart - now,
      projectId: project.id,
      title: project.title,
    };
  }
  if (now <= shootFinish) {
    const total = Math.max(1, project.shootWeeks);
    const done = now - shootStart + 1;
    return {
      status: "SHOOTING",
      progress: Math.round((done / total) * 100),
      label: `Week ${done} of ${total} of shooting`,
      detail: project.genres[0] ?? "Film",
      weeksRemaining: shootFinish - now,
      projectId: project.id,
      title: project.title,
    };
  }
  const total = Math.max(1, release - shootFinish);
  const done = now - shootFinish;
  return {
    status: "POST_PRODUCTION",
    progress: Math.round((Math.min(total, done) / total) * 100),
    label: "Post-production",
    detail: `Release ${formatDate(project.release)}. Does not block new work.`,
    weeksRemaining: Math.max(0, release - now),
    projectId: project.id,
    title: project.title,
  };
}

const STATUS_RANK: Record<WorkStatus, number> = {
  SHOOTING: 5,
  IN_PREP: 4,
  AIRING: 3,
  POST_PRODUCTION: 2,
  AVAILABLE: 1,
};

export function workStatus(state: GameState, personId: number, date = state.date): PhaseView {
  const best = describeAssignment(state, personId, date);
  const hold = activeHold(state.holds, personId, date);
  if (hold && (best.status === "AVAILABLE" || best.status === "POST_PRODUCTION" || best.status === "AIRING")) {
    return {
      status: "IN_PREP",
      progress: 50,
      label: "On hold",
      detail: hold.reason,
      weeksRemaining: Math.max(0, absWeek(hold.end) - absWeek(date)),
      projectId: hold.id,
      title: hold.reason,
    };
  }
  return best;
}

function activeHold(holds: Hold[], personId: number, date: GameDate): Hold | undefined {
  const now = absWeek(date);
  return holds.find((h) => h.personId === personId && absWeek(h.start) <= now && absWeek(h.end) >= now);
}

export function describeAssignment(state: GameState, personId: number, date = state.date): PhaseView {
  const views: PhaseView[] = [];
  for (const project of state.projects) {
    if (project.cancelled) continue;
    const onIt = project.cast.some((c) => c.personId === personId && c.active && !c.writtenOut);
    if (!onIt) continue;
    const view = phaseAt(project, date);
    if (view.status === "AVAILABLE" && (view.label === "Released" || view.label === "Wrapped" || view.label === "Ended")) continue;
    views.push(view);
  }
  views.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  return (
    views[0] ?? {
      status: "AVAILABLE",
      progress: 0,
      label: "Available",
      detail: "Clear for prep and shooting.",
      weeksRemaining: 0,
    }
  );
}

export function clientAttention(state: GameState, client: Client): string[] {
  const flags: string[] = [];
  if (state.offers.some((o) => o.personId === client.personId && o.status === "pending")) flags.push("Pending offer");
  if (client.mood === "Unhappy" || client.mood === "Furious") flags.push("Unhappy");
  if (client.contract) {
    const end = addWeeks(client.contract.start, client.contract.termYears * 52);
    const weeks = absWeek(end) - absWeek(state.date);
    if (weeks <= 12) flags.push(weeks < 0 ? "Contract expired" : "Contract expiring");
  }
  const latest = client.verdicts[0];
  if (latest && absWeek(state.date) - absWeek(latest.when) <= 2) flags.push("New verdict");
  return flags;
}

export function contractEnd(client: Client): GameDate | null {
  if (!client.contract) return null;
  return addWeeks(client.contract.start, client.contract.termYears * 52);
}

export function weeksUntilNextEvent(state: GameState): number {
  const now = absWeek(state.date);
  if (state.events.some((e) => !e.resolved)) return 1;
  let best = now + 12;
  const consider = (date: GameDate) => {
    const abs = absWeek(date);
    if (abs > now && abs < best) best = abs;
  };
  for (const offer of state.offers) if (offer.status === "pending") consider(offer.expires);
  for (const approach of state.approaches) if (approach.status === "pending") consider(approach.expires);
  for (const project of state.projects) {
    if (project.cancelled || project.historical) continue;
    consider(project.prepStart);
    consider(project.shootStart);
    consider(addWeeks(project.shootStart, project.shootWeeks));
    consider(project.release);
    for (const season of project.seasons) {
      consider(season.premiere);
      if (season.schedule === "weekly") consider(addWeeks(season.premiere, season.episodes));
    }
  }
  for (const client of state.clients) {
    if (client.agency !== "player" || !client.contract) continue;
    const end = contractEnd(client);
    if (end) consider(end);
  }
  for (const ceremony of CEREMONIES) {
    const thisYear = { year: state.date.year, week: ceremony.week };
    if (cmpDate(thisYear, state.date) > 0) consider(thisYear);
    else consider({ year: state.date.year + 1, week: ceremony.week });
  }
  return Math.max(1, best - now);
}

export function tryShift(state: GameState, project: Project, weeks: number): boolean {
  if (weeks === 0) return true;
  const people = new Set<number>();
  for (const member of project.cast) {
    if (member.active && !member.writtenOut) people.add(member.personId);
  }
  if (project.openRole?.forPersonId) people.add(project.openRole.forPersonId);
  const windows = project.kind === "series" && project.seasons.length
    ? project.seasons.map((season) => ({
        prep: addWeeks(season.prepStart, weeks),
        finish: addWeeks(addWeeks(season.shootStart, Math.max(1, season.shootWeeks) - 1), weeks),
      }))
    : [{ prep: addWeeks(project.prepStart, weeks), finish: addWeeks(shootEnd(project), weeks) }];
  for (const personId of people) {
    for (const window of windows) {
      if (scheduleConflict(state, personId, window.prep, window.finish, project.id)) return false;
    }
  }
  shiftProjectDates(project, weeks);
  return true;
}

export function shiftProjectDates(project: Project, weeks: number): void {
  const move = (d: GameDate) => addWeeks(d, weeks);
  project.prepStart = move(project.prepStart);
  project.shootStart = move(project.shootStart);
  project.release = move(project.release);
  for (const season of project.seasons) {
    season.prepStart = move(season.prepStart);
    season.shootStart = move(season.shootStart);
    season.premiere = move(season.premiere);
  }
}
