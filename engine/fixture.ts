import type { Catalog, CatalogPerson } from "./types";
import { GENRES } from "./constants";

function person(partial: Partial<CatalogPerson> & Pick<CatalogPerson, "id" | "name" | "department">): CatalogPerson {
  return {
    profilePath: partial.profilePath ?? null,
    birthday: partial.birthday ?? "1988-04-12",
    deathday: partial.deathday ?? null,
    gender: partial.gender ?? 2,
    popularity: partial.popularity ?? 40,
    nationality: partial.nationality ?? "USA",
    placeOfBirth: partial.placeOfBirth ?? "Los Angeles, California, USA",
    creditCount: partial.creditCount ?? 18,
    avgRating: partial.avgRating ?? 6.8,
    genreMix: partial.genreMix ?? { Drama: 4, Comedy: 2 },
    knownFor: partial.knownFor ?? [],
    ...partial,
  };
}

export function fixtureCatalog(): Catalog {
  const actors: CatalogPerson[] = [];
  for (let i = 1; i <= 80; i++) {
    const genre = GENRES[i % GENRES.length]!;
    const second = GENRES[(i + 3) % GENRES.length]!;
    const year = 1965 + (i % 35);
    actors.push(
      person({
        id: i,
        name: `Actor ${i}`,
        department: "Acting",
        gender: i % 7 === 0 ? 3 : i % 2 === 0 ? 1 : 2,
        birthday: `${year}-06-15`,
        popularity: 8 + (i % 50) * 2,
        avgRating: 5.4 + (i % 20) * 0.12,
        creditCount: 4 + (i % 40),
        nationality: i % 5 === 0 ? "France" : i % 3 === 0 ? "United Kingdom" : "USA",
        genreMix: { [genre]: 5, [second]: 3, Drama: i % 2 },
      }),
    );
  }
  actors.push(
    person({
      id: 9001,
      name: "Too Young",
      department: "Acting",
      birthday: "2012-01-01",
      popularity: 10,
    }),
  );
  actors.push(
    person({
      id: 9002,
      name: "Long Gone",
      department: "Acting",
      birthday: "1920-01-01",
      deathday: "1988-01-01",
      popularity: 30,
    }),
  );
  const directors: CatalogPerson[] = [];
  for (let i = 1; i <= 24; i++) {
    const genre = GENRES[i % GENRES.length]!;
    directors.push(
      person({
        id: 10000 + i,
        name: `Director ${i}`,
        department: "Directing",
        birthday: `${1955 + (i % 30)}-03-03`,
        popularity: 15 + i * 3,
        avgRating: 6 + (i % 8) * 0.2,
        creditCount: 6 + i,
        genreMix: { [genre]: 6, Drama: 2 },
      }),
    );
  }
  return { actors, directors };
}
