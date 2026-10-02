import type { Catalog, CatalogPerson, RealCredit } from "@/engine/types";
import { prisma } from "@/lib/prisma";

function credits(value: unknown): RealCredit[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const credit = row as Record<string, unknown>;
      const title = typeof credit.title === "string" ? credit.title : "";
      if (!title) return null;
      return {
        title,
        year: typeof credit.year === "string" ? credit.year : "",
        character: typeof credit.character === "string" ? credit.character : "",
        rating: typeof credit.rating === "number" ? credit.rating : 0,
        mediaType: typeof credit.mediaType === "string" ? credit.mediaType : "movie",
      };
    })
    .filter((row): row is RealCredit => Boolean(row));
}

function mix(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number") out[key] = count;
  }
  return out;
}

export function toCatalogPerson(row: {
  tmdbId: number;
  name: string;
  department: string;
  profilePath: string | null;
  birthday: string | null;
  deathday: string | null;
  gender: number;
  popularity: number;
  nationality: string | null;
  placeOfBirth: string | null;
  creditCount: number;
  avgRating: number;
  genreMix: unknown;
  knownFor: unknown;
  movieCredits?: unknown;
  tvCredits?: unknown;
}): CatalogPerson {
  return {
    id: row.tmdbId,
    name: row.name,
    department: row.department === "Directing" ? "Directing" : "Acting",
    profilePath: row.profilePath,
    birthday: row.birthday,
    deathday: row.deathday,
    gender: row.gender,
    popularity: row.popularity,
    nationality: row.nationality,
    placeOfBirth: row.placeOfBirth,
    creditCount: row.creditCount,
    avgRating: row.avgRating,
    genreMix: mix(row.genreMix),
    knownFor: credits(row.knownFor),
    movieCredits: side(row.movieCredits),
    tvCredits: side(row.tvCredits),
  };
}

function side(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const count = typeof row.count === "number" ? row.count : 0;
  if (!count) return undefined;
  const titles = Array.isArray(row.titles)
    ? row.titles.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const credit = item as Record<string, unknown>;
        return [{
          title: typeof credit.title === "string" ? credit.title : "",
          year: typeof credit.year === "string" ? credit.year : "",
          rating: typeof credit.rating === "number" ? credit.rating : 0,
        }];
      })
    : [];
  return {
    count,
    avgRating: typeof row.avgRating === "number" ? row.avgRating : 0,
    recent: typeof row.recent === "number" ? row.recent : 0,
    titles,
  };
}

export async function loadCatalog(): Promise<Catalog> {
  const [actors, directors] = await Promise.all([
    prisma.person.findMany({ where: { department: "Acting", hydrated: true }, orderBy: { popularity: "desc" } }),
    prisma.person.findMany({ where: { department: "Directing", hydrated: true }, orderBy: { popularity: "desc" } }),
  ]);
  return { actors: actors.map(toCatalogPerson), directors: directors.map(toCatalogPerson) };
}

export async function dataSummary() {
  const [actors, directors, genres, movies, sampleActors, sampleDirectors, genreRows] = await Promise.all([
    prisma.person.count({ where: { department: "Acting", hydrated: true } }),
    prisma.person.count({ where: { department: "Directing", hydrated: true } }),
    prisma.genre.count(),
    prisma.movieCache.count(),
    prisma.person.findMany({ where: { department: "Acting", hydrated: true }, orderBy: { popularity: "desc" }, take: 12 }),
    prisma.person.findMany({ where: { department: "Directing", hydrated: true }, orderBy: { popularity: "desc" }, take: 8 }),
    prisma.genre.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { actors, directors, genres, movies, sampleActors, sampleDirectors, genreRows };
}
