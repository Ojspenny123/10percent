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

function intervalWeeks(start: GameDate, weeks: number, projectId: string): Interval {
  return {
    start: absWeek(start),
    end: absWeek(addWeeks(start, Math.max(1, weeks) - 1)),
    projectId,
    kind: "block",
  };
}

export function memberShootIntervals(
  project: Project,
  member: { role: string; episodes?: number; blocks?: { start: GameDate; weeks: number }[]; seasonNumber?: number },
): Interval[] {
  if (member.blocks && member.blocks.length > 0) {
    return member.blocks.map((block) => intervalWeeks(block.start, block.weeks, project.id));
  }
  if (project.kind !== "series" || project.seasons.length === 0) return blockingIntervals(project);
  const season = project.seasons.find((item) => item.number === member.seasonNumber) ?? project.seasons[project.seasons.length - 1]!;
  if (member.role === "Guest Star") {
    const weeks = Math.min(2, Math.max(1, member.episodes ?? 1));
    return [intervalWeeks(season.shootStart, weeks, project.id)];
  }
  if (member.role === "Recurring") {
    const episodes = member.episodes ?? Math.max(1, Math.round(season.episodes / 2));
    const weeks = Math.max(1, Math.min(season.shootWeeks, Math.round((season.shootWeeks * episodes) / Math.max(1, season.episodes))));
    return [intervalWeeks(season.shootStart, weeks, project.id)];
  }
  const end = absWeek(addWeeks(season.shootStart, Math.max(1, season.shootWeeks) - 1));
  const weeks = end - absWeek(season.prepStart) + 1;
  return [intervalWeeks(season.prepStart, weeks, project.id)];
}

export function personBlocks(state: GameState, personId: number, ignoreProjectId?: string): Interval[] {
  const blocks: Interval[] = [];
  for (const project of state.projects) {
    if (project.id === ignoreProjectId || project.cancelled) continue;
    if (project.openRole?.forPersonId === personId) {
      if (project.origin === "pilot" || project.pilot) blocks.push(intervalWeeks(project.shootStart, 2, project.id));
      else blocks.push(...blockingIntervals(project));
    }
    for (const member of project.cast) {
      if (member.personId !== personId || !member.active || member.writtenOut) continue;
      blocks.push(...memberShootIntervals(project, member));
    }
  }
  for (const hold of state.holds) {
    if (hold.personId !== personId || hold.kind === "pilot") continue;
    blocks.push({
      start: absWeek(hold.start),
      end: absWeek(hold.end),
      projectId: hold.projectId ?? hold.id,
      kind: "block",
    });
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

export function blocksConflict(
  state: GameState,
  personId: number,
  blocks: { start: GameDate; weeks: number }[],
  ignoreProjectId?: string,
): { projectId: string; message: string } | null {
  for (const block of blocks) {
    const hit = scheduleConflict(
      state,
      personId,
      block.start,
      addWeeks(block.start, Math.max(1, block.weeks) - 1),
      ignoreProjectId,
    );
    if (hit) return hit;
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
  const pilot = state.holds.find(
    (hold) => hold.personId === personId && hold.kind === "pilot" && absWeek(hold.end) >= absWeek(date) && absWeek(hold.start) <= absWeek(date),
  );
  if (pilot && (best.status === "AVAILABLE" || best.status === "POST_PRODUCTION" || best.status === "AIRING")) {
    const until = pilot.until ?? pilot.end;
    return {
      status: "IN_PREP",
      progress: 40,
      label: "On hold (pilot)",
      detail: `Decision ${formatDate(until)}. ${pilot.reason} Gap work is allowed until the network picks the series up.`,
      weeksRemaining: Math.max(0, absWeek(until) - absWeek(date)),
      projectId: pilot.projectId ?? pilot.id,
      title: pilot.reason,
    };
  }
  const hold = activeHold(state.holds.filter((item) => item.kind !== "pilot"), personId, date);
  if (hold && (best.status === "AVAILABLE" || best.status === "POST_PRODUCTION" || best.status === "AIRING")) {
    const label = hold.kind === "franchise" ? "Franchise hold" : hold.kind === "series" ? "Series lock" : "On hold";
    return {
      status: "IN_PREP",
      progress: 50,
      label,
      detail: hold.reason,
      weeksRemaining: Math.max(0, absWeek(hold.end) - absWeek(date)),
      projectId: hold.projectId ?? hold.id,
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
    const member = project.cast.find((c) => c.personId === personId && c.active && !c.writtenOut);
    if (!member) continue;
    const partial = project.kind === "series" && (member.blocks?.length || member.role === "Recurring" || member.role === "Guest Star");
    if (partial) {
      const windows = memberShootIntervals(project, member);
      const now = absWeek(date);
      const current = windows.find((window) => now >= window.start && now <= window.end);
      const upcoming = windows.find((window) => window.start > now);
      const totalEps = member.episodes ?? project.seasons[project.seasons.length - 1]?.episodes ?? 1;
      if (!current) {
        if (upcoming) {
          views.push({
            status: "AVAILABLE",
            progress: 0,
            label: "Booked",
            detail: `Next episode block ${formatDate(fromAbs(upcoming.start))}. ${totalEps} episodes on this deal, free outside the blocks.`,
            weeksRemaining: upcoming.start - now,
            projectId: project.id,
            title: project.title,
          });
        }
        continue;
      }
      const span = Math.max(1, current.end - current.start + 1);
      const doneWeeks = now - current.start + 1;
      const filmed = Math.min(totalEps, Math.max(1, Math.round((doneWeeks / span) * (member.blocks?.find((block) => absWeek(block.start) === current.start)?.episodes ?? totalEps))));
      views.push({
        status: now < absWeek(project.seasons[project.seasons.length - 1]?.shootStart ?? project.shootStart) ? "IN_PREP" : "SHOOTING",
        progress: Math.round((doneWeeks / span) * 100),
        label: `${filmed} of ${totalEps} episodes`,
        detail: `${member.role} · ${project.title}`,
        weeksRemaining: current.end - now,
        projectId: project.id,
        title: project.title,
      });
      continue;
    }
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
  for (const member of project.cast) {
    if (!member.blocks) continue;
    for (const block of member.blocks) block.start = move(block.start);
  }
}
