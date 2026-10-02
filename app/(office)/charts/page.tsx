import Link from "next/link";
import { redirect } from "next/navigation";
import { Bars } from "@/components/charts";
import { Card, Explain, PageHeader } from "@/components/ui";
import { money, viewers } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function ChartsPage() {
  const active = await readSlot();
  if (!active) redirect("/");
  const year = active.state.date.year;
  const weekend = active.state.projects.filter((project) => project.kind === "film" && project.release.year === active.state.date.year && project.release.week === active.state.date.week && (project.openingWeekend ?? 0) > 0);
  const yearFilms = active.state.projects
    .filter((project) => project.kind === "film" && project.release.year === year && (project.totalGross ?? 0) > 0)
    .sort((a, b) => (b.totalGross ?? 0) - (a.totalGross ?? 0))
    .slice(0, 10);
  const series = active.state.projects
    .filter((project) => project.kind === "series" && project.seasons.some((season) => season.viewership.length))
    .map((project) => {
      const latest = project.seasons[project.seasons.length - 1]!;
      const avg = latest.viewership.reduce((sum, value) => sum + value, 0) / latest.viewership.length;
      return { project, avg };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);
  return (
    <main>
      <PageHeader title="Charts" lede={`The business around ${active.state.agency.name}, ${year}.`} />
      <Card>
        <h2 className="font-serif text-xl">Openers this week</h2>
        {weekend.length === 0 ? <p className="mt-2 text-sm text-muted">No wide openings dated this week. The previous year is already in the year chart.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {weekend.sort((a, b) => (b.openingWeekend ?? 0) - (a.openingWeekend ?? 0)).map((project, index) => (
              <li key={project.id} className="flex justify-between gap-3">
                <span>{index + 1}. <Link href={`/projects/${project.id}`} className="hover:text-teal">{project.title}</Link></span>
                <Explain tip={project.resultWhy?.opening ?? "Opening weekend domestic."}>{money(project.openingWeekend ?? 0)}</Explain>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-4">
        <h2 className="font-serif text-xl">Top films of {year}</h2>
        {yearFilms.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing has reported a gross yet this year.</p> : (
          <>
            <Bars values={yearFilms.map((project) => project.totalGross ?? 0)} labels={yearFilms.map((project) => project.title.split(" ")[0] ?? "")} format={(value) => money(value)} />
            <ol className="mt-3 space-y-1 text-sm">
              {yearFilms.map((project) => (
                <li key={project.id}><Link href={`/projects/${project.id}`} className="hover:text-teal">{project.title}</Link> · {money(project.totalGross ?? 0)} · critics {project.criticScore}</li>
              ))}
            </ol>
          </>
        )}
      </Card>
      <Card className="mt-4">
        <h2 className="font-serif text-xl">Series</h2>
        {series.length === 0 ? <p className="mt-2 text-sm text-muted">No episodes have aired.</p> : (
          <ol className="mt-3 space-y-1 text-sm">
            {series.map(({ project, avg }) => (
              <li key={project.id}><Link href={`/projects/${project.id}`} className="hover:text-teal">{project.title}</Link> · avg {viewers(avg)} · {project.seasons[project.seasons.length - 1]?.renewal.replace("_", " ")}</li>
            ))}
          </ol>
        )}
      </Card>
    </main>
  );
}
