import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { absWeek, addWeeks, formatDate, fromAbs, phaseAt } from "@/engine";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function SlatePage() {
  const active = await readSlot();
  if (!active) redirect("/");
  const clients = active.state.clients.filter((client) => client.agency === "player");
  const start = absWeek(active.state.date);
  const weeks = Array.from({ length: 16 }, (_, index) => fromAbs(start + index));
  const projects = active.state.projects.filter((project) => project.playerInvolved && !project.cancelled).sort((a, b) => absWeek(a.prepStart) - absWeek(b.prepStart));
  return (
    <main>
      <PageHeader title="Slate" lede="One client, one prep or shoot at a time. Post and airing sit on top of a free calendar." />
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="min-w-[860px] text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2">Client</th>
              {weeks.map((week) => <th key={week.week + week.year} className="px-1 py-2 font-normal text-muted">W{week.week}</th>)}
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.personId} className="border-t border-line">
                <td className="sticky left-0 bg-white px-3 py-2 font-medium"><Link href={`/actors/${client.personId}`}>{client.name}</Link></td>
                {weeks.map((week) => {
                  const abs = absWeek(week);
                  const hit = projects.find((project) => {
                    const on = project.cast.some((member) => member.personId === client.personId && member.active && !member.writtenOut);
                    if (!on) return false;
                    const windows = project.kind === "series" && project.seasons.length
                      ? project.seasons.map((season) => [absWeek(season.prepStart), absWeek(addWeeks(season.shootStart, season.shootWeeks - 1))] as const)
                      : [[absWeek(project.prepStart), absWeek(addWeeks(project.shootStart, project.shootWeeks - 1))] as const];
                    return windows.some(([from, to]) => abs >= from && abs <= to);
                  });
                  return <td key={abs} className="px-1 py-2"><span className={`block h-6 rounded ${hit ? "bg-coral" : "bg-line/60"}`} title={hit ? hit.title : "Free"} /></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-6 space-y-2">
        {projects.map((project) => {
          const phase = phaseAt(project, active.state.date);
          return (
            <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
              <Link href={`/projects/${project.id}`} className="font-medium hover:text-teal">{project.title}</Link>
              <span className="text-muted">{project.genres[0]} · {formatDate(project.shootStart)}</span>
              <span className="rounded-full bg-line px-2.5 py-1 text-xs font-medium" title={phase.detail}>{phase.label}{phase.progress > 0 && phase.status !== "AVAILABLE" ? ` · ${phase.progress}%` : ""}</span>
            </li>
          );
        })}
      </ul>
      {clients.length === 0 ? <p className="mt-4 text-sm text-muted">Sign a client and the calendar grows a row.</p> : null}
    </main>
  );
}

