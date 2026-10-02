import Link from "next/link";
import { redirect } from "next/navigation";
import { campaignAction } from "@/lib/actions";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { CEREMONIES } from "@/engine/constants";
import { formatDate } from "@/engine";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function AwardsPage() {
  const active = await readSlot();
  if (!active) redirect("/");
  const upcoming = CEREMONIES.map((ceremony) => {
    const year = ceremony.week >= active.state.date.week ? active.state.date.year : active.state.date.year + 1;
    return { ...ceremony, year, when: formatDate({ year, week: ceremony.week }) };
  }).sort((a, b) => a.year - b.year || a.week - b.week);
  const yours = active.state.projects.filter((project) => project.playerInvolved && project.kind === "film" && project.ended && project.release.year >= active.state.date.year - 1);
  return (
    <main>
      <PageHeader title="Awards" lede="Real ceremonies, fictional nominees. Late-year releases and campaigns move the needle." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl">Calendar</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {upcoming.map((ceremony) => (
              <li key={`${ceremony.id}${ceremony.year}`} className="flex justify-between gap-3">
                <span>{ceremony.name}</span>
                <span className="text-muted">{ceremony.when}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-serif text-xl">Campaign a film</h2>
          {yours.length === 0 ? <p className="mt-2 text-sm text-muted">You need a released film first.</p> : yours.map((project) => (
            <form key={project.id} action={campaignAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="projectId" value={project.id} />
              <Link href={`/projects/${project.id}`} className="font-medium hover:text-teal">{project.title}</Link>
              <span className="text-muted">{money(project.fycSpend)} in</span>
              <select name="amount" className="rounded-xl border border-line px-2 py-1">
                <option value={100000}>$100K</option>
                <option value={250000}>$250K</option>
                <option value={500000}>$500K</option>
              </select>
              <button className={buttonClass("secondary")}>Fund</button>
            </form>
          ))}
        </Card>
      </div>
      <div className="mt-6 space-y-3">
        {active.state.awards.slice(0, 40).map((award) => (
          <Card key={award.id}>
            <p className="text-sm text-muted">{award.ceremony} {award.year}</p>
            <h2 className="font-serif text-xl">{award.category}</h2>
            <ul className="mt-2 text-sm">
              {award.nominees.map((nominee, index) => (
                <li key={`${nominee.projectId}${nominee.name}`} className={index === award.winnerIndex ? "font-medium" : "text-muted"}>
                  {index === award.winnerIndex ? "Winner · " : ""}
                  {nominee.personId ? <Link href={`/actors/${nominee.personId}`} className="hover:text-teal">{nominee.name}</Link> : nominee.name}
                  {" · "}
                  <Link href={`/projects/${nominee.projectId}`} className="hover:text-teal">{nominee.title}</Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {active.state.awards.length === 0 ? <p className="text-sm text-muted">The first ceremony has not happened in this save yet. January is busy.</p> : null}
      </div>
    </main>
  );
}
