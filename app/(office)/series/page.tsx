import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { seriesStatus, yearsRunning } from "@/engine";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function SeriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const series = active.state.projects.filter((project) => project.kind === "series");
  const networks = [...new Set(series.map((project) => project.network).filter(Boolean))].sort() as string[];
  const genres = [...new Set(series.map((project) => project.genres[0]).filter(Boolean))].sort() as string[];
  const years = [...new Set(series.flatMap((project) => project.seasons.map((season) => season.producedYear ?? season.shootStart.year)))].sort();
  const rows = series
    .map((project) => ({ project, status: seriesStatus(project, active.state.date), years: yearsRunning(project) }))
    .filter(({ project, status }) => {
      if (params.status && status !== params.status) return false;
      if (params.genre && project.genres[0] !== params.genre) return false;
      if (params.network && project.network !== params.network) return false;
      if (params.year && !project.seasons.some((season) => String(season.producedYear ?? season.shootStart.year) === params.year)) return false;
      return true;
    })
    .sort((a, b) => b.project.seasons.length - a.project.seasons.length || a.project.title.localeCompare(b.project.title));
  return (
    <main>
      <PageHeader title="Series" lede="Every series in this save, including pilots that are still waiting on a network." />
      <form className="mb-5 flex flex-wrap gap-2 text-sm" action="/series">
        <select name="status" defaultValue={params.status || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Status">
          <option value="">Any status</option>
          {["in production", "airing", "between seasons", "pilot", "renewal pending", "cancelled", "ended", "in development"].map((status) => <option key={status}>{status}</option>)}
        </select>
        <select name="genre" defaultValue={params.genre || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Genre">
          <option value="">Any genre</option>
          {genres.map((genre) => <option key={genre}>{genre}</option>)}
        </select>
        <select name="network" defaultValue={params.network || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Network">
          <option value="">Any network</option>
          {networks.map((network) => <option key={network}>{network}</option>)}
        </select>
        <select name="year" defaultValue={params.year || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Year">
          <option value="">Any year</option>
          {years.map((year) => <option key={year}>{year}</option>)}
        </select>
        <button className="rounded-full bg-ink px-3 py-2 text-white">Filter</button>
      </form>
      <ul className="space-y-2">
        {rows.map(({ project, status, years: span }) => (
          <li key={project.id} className="rounded-2xl border border-line bg-white px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/projects/${project.id}`} className="font-medium hover:text-teal">{project.title}</Link>
              <span className="text-xs uppercase tracking-wide text-muted">{status}</span>
            </div>
            <p className="text-sm text-muted">{project.genres[0]} · {project.network} · {project.seasons.length} season{project.seasons.length === 1 ? "" : "s"} · {span}</p>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="mt-4 text-sm text-muted">No series match these filters yet.</p> : null}
    </main>
  );
}
