import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const BASE = "https://api.themoviedb.org/3";
const ACTOR_TARGET = 2000;
const DIRECTOR_TARGET = 300;

const GENRE_NAME: Record<number, string> = {
  28: "Action",
  12: "Action",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "Historical",
  27: "Horror",
  10402: "Musical",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "Drama",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action",
  10762: "Family",
  10765: "Sci-Fi",
  10768: "War",
};

const MOVIE_LISTS: { path: string; pages: number }[] = [
  { path: "/movie/popular", pages: 20 },
  { path: "/movie/top_rated", pages: 15 },
  { path: "/discover/movie?sort_by=popularity.desc&vote_count.gte=50", pages: 10 },
];

type SeedReport = {
  done: boolean;
  phase: string;
  actors: number;
  directors: number;
  movies: number;
  message: string;
};

const recent: number[] = [];

async function throttle(): Promise<void> {
  const now = Date.now();
  while (recent.length && now - recent[0]! > 1000) recent.shift();
  if (recent.length >= 12) {
    const wait = 1000 - (now - recent[0]!) + 20;
    await sleep(wait);
  }
  recent.push(Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tmdb(path: string, attempt = 0): Promise<Record<string, unknown>> {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) throw new Error("TMDB_READ_TOKEN is missing. Add it to .env.local and keep it server-side.");
  await throttle();
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}language=en-US`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (response.status === 429 && attempt < 6) {
    const retry = Number(response.headers.get("retry-after") || 2);
    await sleep(Math.max(1000, retry * 1000));
    return tmdb(path, attempt + 1);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TMDB ${response.status} on ${path}: ${body.slice(0, 180)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function nationalityFrom(place: unknown): string | null {
  if (typeof place !== "string" || !place.trim()) return null;
  const parts = place.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

function yearOf(date: unknown): string {
  return typeof date === "string" && date.length >= 4 ? date.slice(0, 4) : "";
}

async function counts() {
  const [actors, directors, movies, actorPhotos, directorPhotos] = await Promise.all([
    prisma.person.count({ where: { department: "Acting", hydrated: true } }),
    prisma.person.count({ where: { department: "Directing", hydrated: true } }),
    prisma.movieCache.count(),
    prisma.person.count({ where: { department: "Acting", hydrated: true, profilePath: { not: null } } }),
    prisma.person.count({ where: { department: "Directing", hydrated: true, profilePath: { not: null } } }),
  ]);
  return { actors, directors, movies, actorPhotos, directorPhotos };
}

function portraitsComplete(report: { actorPhotos: number; directorPhotos: number }): boolean {
  return report.actorPhotos >= ACTOR_TARGET && report.directorPhotos >= DIRECTOR_TARGET;
}

async function ensureState() {
  return prisma.seedState.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", phase: "genres", status: "running", actorTarget: ACTOR_TARGET, directorTarget: DIRECTOR_TARGET },
  });
}

export async function seedStatus(): Promise<SeedReport> {
  const state = await prisma.seedState.findUnique({ where: { id: "default" } });
  const report = await counts();
  return {
    done: state?.phase === "done" && portraitsComplete(report),
    phase: state?.phase ?? "idle",
    actors: report.actors,
    directors: report.directors,
    movies: report.movies,
    message: state?.message || "Seed has not started.",
  };
}

export async function seedBatch(peoplePerBatch = 20): Promise<SeedReport> {
  const state = await ensureState();
  if (state.phase === "done") {
    const report = await counts();
    if (portraitsComplete(report)) {
      return { done: true, phase: "done", actors: report.actors, directors: report.directors, movies: report.movies, message: state.message };
    }
    await prisma.seedState.update({
      where: { id: "default" },
      data: { phase: "people", status: "running", message: `Portraits short (${report.actorPhotos} actors, ${report.directorPhotos} directors). Collecting more.` },
    });
  }
  try {
    if (state.phase === "genres" || state.phase === "init") await seedGenres();
    const fresh = await prisma.seedState.findUniqueOrThrow({ where: { id: "default" } });
    if (fresh.phase === "movies") await seedMoviePages();
    const mid = await prisma.seedState.findUniqueOrThrow({ where: { id: "default" } });
    if (mid.phase === "people") await seedPopularPage();
    const afterPeople = await prisma.seedState.findUniqueOrThrow({ where: { id: "default" } });
    if (afterPeople.phase === "credits") await seedDirectorCredits();
    const hydrating = await prisma.seedState.findUniqueOrThrow({ where: { id: "default" } });
    if (hydrating.phase === "hydrate") await hydratePeople(peoplePerBatch);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seed failed";
    await prisma.seedState.update({ where: { id: "default" }, data: { status: "error", message } });
    throw error;
  }
  const latest = await prisma.seedState.findUniqueOrThrow({ where: { id: "default" } });
  const { actors, directors, movies } = await counts();
  return {
    done: latest.phase === "done",
    phase: latest.phase,
    actors,
    directors,
    movies,
    message: latest.message,
  };
}

export async function seedUntilDone(log: (message: string) => void = console.log): Promise<void> {
  for (let i = 0; i < 5000; i++) {
    const report = await seedBatch(30);
    log(report.message);
    if (report.done) return;
  }
  throw new Error("Seed did not finish. Run npm run seed again; it resumes.");
}

async function seedGenres(): Promise<void> {
  const movie = await tmdb("/genre/movie/list");
  const tv = await tmdb("/genre/tv/list");
  const rows = [...asArray(movie.genres), ...asArray(tv.genres)];
  for (const row of rows) {
    const id = numberOf(row.id);
    const name = stringOf(row.name);
    if (!id || !name) continue;
    await prisma.genre.upsert({ where: { tmdbId: id }, update: { name }, create: { tmdbId: id, name } });
  }
  await prisma.seedState.update({
    where: { id: "default" },
    data: { phase: "movies", status: "running", message: "Genres cached. Pulling a movie genre index." },
  });
}

async function seedMoviePages(): Promise<void> {
  const state = await prisma.seedState.findUniqueOrThrow({ where: { id: "default" } });
  const movies = await prisma.movieCache.count();
  if (movies >= 1000 || state.movieListIndex >= MOVIE_LISTS.length) {
    await prisma.seedState.update({
      where: { id: "default" },
      data: { phase: "people", message: `Movie index has ${movies} titles. Collecting popular people.` },
    });
    return;
  }
  const list = MOVIE_LISTS[state.movieListIndex]!;
  const page = state.moviePage;
  const payload = await tmdb(`${list.path}${list.path.includes("?") ? "&" : "?"}page=${page}`);
  for (const movie of asArray(payload.results)) {
    const id = numberOf(movie.id);
    if (!id) continue;
    const title = stringOf(movie.title) || stringOf(movie.name) || "Untitled";
    const genreIds = Array.isArray(movie.genre_ids) ? movie.genre_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)) : [];
    await prisma.movieCache.upsert({
      where: { tmdbId: id },
      update: { title, genreIds, voteAverage: numberOf(movie.vote_average) ?? 0, popularity: numberOf(movie.popularity) ?? 0, year: Number(yearOf(movie.release_date)) || null },
      create: {
        tmdbId: id,
        title,
        genreIds,
        voteAverage: numberOf(movie.vote_average) ?? 0,
        popularity: numberOf(movie.popularity) ?? 0,
        year: Number(yearOf(movie.release_date)) || null,
      },
    });
  }
  const nextPage = page + 1;
  const doneList = nextPage > list.pages || nextPage > (numberOf(payload.total_pages) ?? nextPage);
  await prisma.seedState.update({
    where: { id: "default" },
    data: doneList
      ? { movieListIndex: state.movieListIndex + 1, moviePage: 1, message: `Indexed movies from ${list.path}.` }
      : { moviePage: nextPage, message: `Movies ${list.path} page ${page}.` },
  });
}

async function seedPopularPage(): Promise<void> {
  const actors = await prisma.seedCandidate.count({ where: { department: "Acting", profilePath: { not: null } } });
  const directors = await prisma.seedCandidate.count({ where: { department: "Directing", profilePath: { not: null } } });
  const state = await prisma.seedState.findUniqueOrThrow({ where: { id: "default" } });
  if ((actors >= ACTOR_TARGET && directors >= DIRECTOR_TARGET) || state.popularPage >= 500) {
    await prisma.seedState.update({
      where: { id: "default" },
      data: {
        phase: directors >= DIRECTOR_TARGET ? "hydrate" : "credits",
        message: directors >= DIRECTOR_TARGET ? `Queued ${actors} actors and ${directors} directors with portraits.` : `Need more directors with portraits (${directors}/${DIRECTOR_TARGET}). Scanning film credits.`,
      },
    });
    return;
  }
  const page = state.popularPage + 1;
  const payload = await tmdb(`/person/popular?page=${page}`);
  for (const person of asArray(payload.results)) {
    const id = numberOf(person.id);
    const department = stringOf(person.known_for_department);
    const profilePath = stringOf(person.profile_path);
    if (!id || !profilePath || (department !== "Acting" && department !== "Directing")) continue;
    if (department === "Acting" && actors >= ACTOR_TARGET) continue;
    if (department === "Directing" && directors >= DIRECTOR_TARGET) continue;
    const knownFor = asArray(person.known_for).slice(0, 8);
    await prisma.seedCandidate.upsert({
      where: { tmdbId: id },
      update: { profilePath },
      create: {
        tmdbId: id,
        department,
        popularity: numberOf(person.popularity) ?? 0,
        profilePath,
        knownFor: json(knownFor),
        selected: true,
      },
    });
  }
  const totalPages = numberOf(payload.total_pages) ?? 500;
  const nextActors = await prisma.seedCandidate.count({ where: { department: "Acting", profilePath: { not: null } } });
  const nextDirectors = await prisma.seedCandidate.count({ where: { department: "Directing", profilePath: { not: null } } });
  const finished = page >= totalPages || (nextActors >= ACTOR_TARGET && nextDirectors >= DIRECTOR_TARGET);
  await prisma.seedState.update({
    where: { id: "default" },
    data: {
      popularPage: page,
      actorsDone: nextActors,
      directorsDone: nextDirectors,
      phase: finished ? (nextDirectors >= DIRECTOR_TARGET ? "hydrate" : "credits") : "people",
      message: `Popular people page ${page}. Actors ${nextActors}/${ACTOR_TARGET}, directors ${nextDirectors}/${DIRECTOR_TARGET}.`,
    },
  });
}

async function seedDirectorCredits(): Promise<void> {
  const directors = await prisma.seedCandidate.count({ where: { department: "Directing", profilePath: { not: null } } });
  if (directors >= DIRECTOR_TARGET) {
    await prisma.seedState.update({ where: { id: "default" }, data: { phase: "hydrate", message: "Director quota met." } });
    return;
  }
  const movies = await prisma.movieCache.findMany({ where: { creditsScanned: false }, orderBy: { popularity: "desc" }, take: 8 });
  if (movies.length === 0) {
    await prisma.seedState.update({
      where: { id: "default" },
      data: { phase: "hydrate", message: `Stopped credit scan at ${directors} directors.` },
    });
    return;
  }
  for (const movie of movies) {
    const payload = await tmdb(`/movie/${movie.tmdbId}/credits`);
    const crew = asArray(payload.crew);
    const director = crew.find((row) => stringOf(row.job) === "Director" && stringOf(row.profile_path));
    if (director) {
      const id = numberOf(director.id);
      const profilePath = stringOf(director.profile_path);
      if (id && profilePath) {
        await prisma.seedCandidate.upsert({
          where: { tmdbId: id },
          update: { profilePath },
          create: {
            tmdbId: id,
            department: "Directing",
            popularity: numberOf(director.popularity) ?? movie.popularity,
            profilePath,
            knownFor: json([{ id: movie.tmdbId, title: movie.title, media_type: "movie", genre_ids: movie.genreIds, vote_average: movie.voteAverage }]),
            selected: true,
          },
        });
      }
    }
    await prisma.movieCache.update({ where: { tmdbId: movie.tmdbId }, data: { creditsScanned: true } });
  }
  const next = await prisma.seedCandidate.count({ where: { department: "Directing", profilePath: { not: null } } });
  await prisma.seedState.update({
    where: { id: "default" },
    data: { directorsDone: next, message: `Credit scan: ${next}/${DIRECTOR_TARGET} directors.` },
  });
}

async function hydratePeople(limit: number): Promise<void> {
  const hydratedIds = (await prisma.person.findMany({ where: { hydrated: true }, select: { tmdbId: true } })).map((row) => row.tmdbId);
  const queue = await prisma.seedCandidate.findMany({
    where: hydratedIds.length
      ? { selected: true, profilePath: { not: null }, tmdbId: { notIn: hydratedIds } }
      : { selected: true, profilePath: { not: null } },
    orderBy: { popularity: "desc" },
    take: limit,
  });
  if (queue.length === 0) {
    const report = await counts();
    const { actors, directors, actorPhotos, directorPhotos } = report;
    const progress = await prisma.seedState.findUnique({ where: { id: "default" } });
    const canPage = (progress?.popularPage ?? 0) < 500 && !portraitsComplete(report);
    await prisma.seedState.update({
      where: { id: "default" },
      data: {
        phase: canPage ? "people" : "done",
        status: portraitsComplete(report) ? "complete" : "running",
        actorsDone: actorPhotos,
        directorsDone: directorPhotos,
        message: portraitsComplete(report)
          ? `Seed complete. ${actorPhotos} actors and ${directorPhotos} directors with portraits (${actors} / ${directors} hydrated).`
          : canPage
            ? `Hydration caught up (${actorPhotos} actor portraits, ${directorPhotos} director portraits). Collecting more names.`
            : `Seed finished the available TMDB pages with ${actorPhotos} actor portraits and ${directorPhotos} director portraits.`,
      },
    });
    return;
  }
  await mapPool(queue, 6, async (candidate) => {
    const detail = await tmdb(`/person/${candidate.tmdbId}?append_to_response=combined_credits`);
    const credits = (detail.combined_credits ?? {}) as { cast?: unknown[]; crew?: unknown[] };
    const cast = asArray(credits.cast);
    const crew = asArray(credits.crew);
    const acting = candidate.department === "Acting";
    const relevant = acting ? cast : crew.filter((row) => stringOf(row.job) === "Director" || stringOf(row.department) === "Directing");
    const lookupIds = relevant.map((credit) => numberOf(credit.id)).filter((id): id is number => Boolean(id)).slice(0, 60);
    const cache = lookupIds.length ? await prisma.movieCache.findMany({ where: { tmdbId: { in: lookupIds } } }) : [];
    const byId = new Map(cache.map((movie) => [movie.tmdbId, movie.genreIds]));
    const mix: Record<string, number> = {};
    const addGenres = (ids: number[], weight: number) => {
      const names = new Set<string>();
      for (const id of ids) {
        const name = GENRE_NAME[id];
        if (name) names.add(name);
      }
      if (names.has("Comedy") && names.has("Romance")) names.add("Romantic Comedy");
      for (const name of names) mix[name] = (mix[name] ?? 0) + weight;
    };
    for (const known of asArray(candidate.knownFor)) {
      const ids = Array.isArray(known.genre_ids) ? known.genre_ids.map(Number) : byId.get(numberOf(known.id) ?? -1) ?? [];
      addGenres(ids, 2);
    }
    let weightSum = 0;
    let ratingSum = 0;
    const filmography: { title: string; year: string; character: string; rating: number; mediaType: string; votes: number }[] = [];
    for (const credit of relevant) {
      const votes = numberOf(credit.vote_count) ?? 0;
      const rating = numberOf(credit.vote_average) ?? 0;
      if (votes > 20 && rating > 0) {
        weightSum += votes;
        ratingSum += rating * votes;
      }
      const id = numberOf(credit.id);
      if (id) addGenres(byId.get(id) ?? [], 1);
      filmography.push({
        title: stringOf(credit.title) || stringOf(credit.name) || "Untitled",
        year: yearOf(credit.release_date) || yearOf(credit.first_air_date),
        character: stringOf(credit.character) || (acting ? "" : "Director"),
        rating,
        mediaType: stringOf(credit.media_type) || "movie",
        votes,
      });
    }
    filmography.sort((a, b) => b.votes - a.votes);
    const avgRating = weightSum > 0 ? ratingSum / weightSum : 0;
    await prisma.person.upsert({
      where: { tmdbId: candidate.tmdbId },
      update: {
        name: stringOf(detail.name) || `Person ${candidate.tmdbId}`,
        department: candidate.department,
        profilePath: stringOf(detail.profile_path) || candidate.profilePath,
        birthday: stringOf(detail.birthday),
        deathday: stringOf(detail.deathday),
        placeOfBirth: stringOf(detail.place_of_birth),
        nationality: nationalityFrom(detail.place_of_birth),
        gender: numberOf(detail.gender) ?? 0,
        popularity: numberOf(detail.popularity) ?? candidate.popularity,
        creditCount: relevant.length,
        avgRating,
        genreMix: mix,
        knownFor: json(filmography.slice(0, 12).map(({ title, year, character, rating, mediaType }) => ({ title, year, character, rating, mediaType }))),
        hydrated: true,
      },
      create: {
        tmdbId: candidate.tmdbId,
        name: stringOf(detail.name) || `Person ${candidate.tmdbId}`,
        department: candidate.department,
        profilePath: stringOf(detail.profile_path) || candidate.profilePath,
        birthday: stringOf(detail.birthday),
        deathday: stringOf(detail.deathday),
        placeOfBirth: stringOf(detail.place_of_birth),
        nationality: nationalityFrom(detail.place_of_birth),
        gender: numberOf(detail.gender) ?? 0,
        popularity: numberOf(detail.popularity) ?? candidate.popularity,
        creditCount: relevant.length,
        avgRating,
        genreMix: mix,
        knownFor: json(filmography.slice(0, 12).map(({ title, year, character, rating, mediaType }) => ({ title, year, character, rating, mediaType }))),
        hydrated: true,
      },
    });
  });
  const report = await counts();
  const complete = portraitsComplete(report);
  await prisma.seedState.update({
    where: { id: "default" },
    data: {
      phase: complete ? "done" : "hydrate",
      status: complete ? "complete" : "running",
      actorsDone: report.actorPhotos,
      directorsDone: report.directorPhotos,
      message: complete
        ? `Seed complete. ${report.actorPhotos} actors and ${report.directorPhotos} directors with portraits, ${report.movies} indexed films.`
        : `Hydrated batch. Actor portraits ${report.actorPhotos}/${ACTOR_TARGET}, director portraits ${report.directorPhotos}/${DIRECTOR_TARGET}.`,
    },
  });
}

async function mapPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = items[index]!;
      index += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
}

function numberOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
