import Link from "next/link";
import { Portrait } from "@/components/portrait";
import { PageHeader } from "@/components/ui";
import { dataSummary } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const summary = await dataSummary();
  const [actorPhotos, directorPhotos] = await Promise.all([
    prisma.person.count({ where: { department: "Acting", hydrated: true, profilePath: { not: null } } }),
    prisma.person.count({ where: { department: "Directing", hydrated: true, profilePath: { not: null } } }),
  ]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title="Cached talent" lede="Pages read this database. They do not call TMDB." />
      <div className="mb-8 grid gap-3 sm:grid-cols-4">
        {[
          ["Actors", `${summary.actors}`, `${actorPhotos} with portraits`],
          ["Directors", `${summary.directors}`, `${directorPhotos} with portraits`],
          ["Genres", `${summary.genres}`, "TMDB movie and TV lists"],
          ["Indexed films", `${summary.movies}`, "Used only to seed genre mix"],
        ].map(([label, value, note]) => (
          <section key={label} className="rounded-card border border-line bg-white p-4 shadow-card">
            <p className="text-sm text-muted">{label}</p>
            <p className="font-serif text-3xl">{value}</p>
            <p className="text-xs text-muted">{note}</p>
          </section>
        ))}
      </div>
      <h2 className="font-serif text-2xl">Genres</h2>
      <p className="mt-2 text-sm text-muted">{summary.genreRows.map((genre) => genre.name).join(" · ")}</p>
      <h2 className="mt-8 font-serif text-2xl">Most popular actors</h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {summary.sampleActors.map((actor) => (
          <li key={actor.tmdbId} className="overflow-hidden rounded-2xl border border-line bg-white">
            <Portrait path={actor.profilePath} name={actor.name} className="aspect-[2/3]" />
            <p className="px-2 py-2 text-sm font-medium">{actor.name}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-serif text-2xl">Directors</h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summary.sampleDirectors.map((director) => (
          <li key={director.tmdbId} className="overflow-hidden rounded-2xl border border-line bg-white">
            <Portrait path={director.profilePath} name={director.name} className="aspect-[2/3]" />
            <p className="px-2 py-2 text-sm font-medium">{director.name}</p>
            <p className="px-2 pb-3 text-xs text-muted">Avg rating {director.avgRating.toFixed(1)} · {director.creditCount} credits</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm">
        <Link href="/" className="text-teal hover:underline">Back to the office</Link>
      </p>
    </main>
  );
}
