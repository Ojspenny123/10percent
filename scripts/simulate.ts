import { loadLocalEnv } from "../lib/env";

loadLocalEnv();

function fail(errors: string[], message: string) {
  errors.push(message);
  console.error(`FAIL ${message}`);
}

async function main() {
  const errors: string[] = [];
  const { prisma } = await import("../lib/prisma");
  const { loadCatalog } = await import("../lib/catalog");
  const {
    ERA_START,
    acceptOffer,
    actorFit,
    advanceWeeks,
    createGame,
    isEligible,
    overlaps,
    personBlocks,
    scheduleConflict,
    shootEnd,
    signClient,
  } = await import("../engine");

  const [actorPhotos, directorPhotos] = await Promise.all([
    prisma.person.count({ where: { department: "Acting", hydrated: true, profilePath: { not: null } } }),
    prisma.person.count({ where: { department: "Directing", hydrated: true, profilePath: { not: null } } }),
  ]);
  if (actorPhotos < 2000) fail(errors, `actor portraits ${actorPhotos}, need 2000`);
  if (directorPhotos < 300) fail(errors, `director portraits ${directorPhotos}, need 300`);

  const catalog = await loadCatalog();
  let state = createGame({ agencyName: "Paper Lantern", era: "today", seed: 6823, catalog });
  const taken = new Set(state.clients.map((client) => client.personId));
  const prospects = catalog.actors.filter((actor) => actor.profilePath && isEligible(actor, "today", ERA_START.today) && !taken.has(actor.id)).slice(0, 8);
  let signed = 0;
  for (const person of prospects) {
    const result = signClient(state, catalog, person.id, { commission: 8, years: 4, exclusive: true, exitClause: true });
    if (result.ok) {
      state = result.state;
      signed += 1;
    }
  }
  if (signed < 4) fail(errors, `only signed ${signed} clients`);

  let accepted = 0;
  for (let week = 0; week < 260; week++) {
    for (const offer of state.offers) {
      if (offer.status !== "pending") continue;
      const project = state.projects.find((item) => item.id === offer.projectId);
      const client = state.clients.find((item) => item.personId === offer.personId && item.agency === "player");
      if (!project || !client) continue;
      if (scheduleConflict(state, client.personId, project.prepStart, shootEnd(project), project.id)) continue;
      const fit = actorFit(client, project, offer.fee, offer.billing, offer.role);
      if (fit.score < 40) continue;
      const result = acceptOffer(state, offer.id, fit.score < 52);
      if (result.ok) {
        state = result.state;
        accepted += 1;
      }
    }
    state = advanceWeeks(state, catalog, 1, { autoResolveEvents: true }).state;
  }

  const ids = new Set<number>();
  for (const project of state.projects) for (const member of project.cast) if (member.active && !member.writtenOut) ids.add(member.personId);
  let overlapCount = 0;
  for (const id of ids) {
    const blocks = personBlocks(state, id).filter((block) => block.kind === "block");
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i]!;
        const b = blocks[j]!;
        if (a.projectId === b.projectId) continue;
        if (overlaps(a.start, a.end, b.start, b.end)) overlapCount += 1;
      }
    }
  }
  if (overlapCount > 0) fail(errors, `${overlapCount} overlapping prep/shoot windows`);

  const made = state.projects.filter((project) => !project.historical && !project.cancelled);
  const counts: Record<string, number> = {};
  for (const project of made) counts[project.genres[0] ?? "Drama"] = (counts[project.genres[0] ?? "Drama"] ?? 0) + 1;
  const total = made.length;
  const genreCount = Object.keys(counts).length;
  const maxShare = total === 0 ? 1 : Math.max(...Object.values(counts)) / total;
  if (total < 80) fail(errors, `only ${total} generated projects`);
  if (genreCount < 15) fail(errors, `only ${genreCount} genres`);
  if (maxShare > 0.2) fail(errors, `top genre share ${(maxShare * 100).toFixed(1)}%`);

  const verdicts = state.clients.reduce((sum, client) => sum + client.verdicts.length, 0);
  if (accepted < 1) fail(errors, "accepted no offers");
  if (verdicts < 1) fail(errors, "no actor verdicts");

  const outcomes = new Set(state.projects.filter((project) => project.kind === "series").flatMap((project) => project.seasons.map((season) => season.renewal)));
  const interesting = ["renewed", "renewed_short", "cancelled", "finale"].filter((outcome) => outcomes.has(outcome as "renewed"));
  if (interesting.length === 0) fail(errors, "series never renewed, shortened, cancelled, or ended");

  const released = state.projects.filter((project) => project.playerInvolved && project.kind === "film" && project.totalGross != null);
  if (released.length < 1) fail(errors, "no player film reached release");
  const withReviews = released.filter((project) => project.reviews.length > 0);
  if (withReviews.length < 1) fail(errors, "released films have no reviews");

  const saved = JSON.parse(JSON.stringify(state)) as typeof state;
  if (saved.agency.name !== "Paper Lantern" || saved.clients.length !== state.clients.length || saved.date.year !== state.date.year) {
    fail(errors, "save JSON did not round-trip");
  }

  console.log(
    JSON.stringify(
      {
        signed,
        accepted,
        verdicts,
        projects: total,
        genres: genreCount,
        maxShare: Number(maxShare.toFixed(3)),
        seriesOutcomes: [...outcomes],
        releasedFilms: released.length,
        date: state.date,
        cash: state.agency.cash,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
  if (errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
