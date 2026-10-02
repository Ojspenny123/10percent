import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bars, Line } from "@/components/charts";
import { Card, Explain, PageHeader, buttonClass } from "@/components/ui";
import { CEREMONIES } from "@/engine/constants";
import { formatDate, phaseAt, seasonCast, seriesStatus, yearsRunning } from "@/engine";
import { campaignAction, festivalAction } from "@/lib/actions";
import { money, viewers } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const project = active.state.projects.find((item) => item.id === id);
  if (!project) notFound();
  const phase = phaseAt(project, active.state.date);
  const season = project.seasons[project.seasons.length - 1];
  const festivals = CEREMONIES.filter((ceremony) => ceremony.kind === "festival");
  return (
    <main>
      <PageHeader
        title={project.title}
        lede={project.kind === "series"
          ? `${project.seasons.length} season${project.seasons.length === 1 ? "" : "s"} · ${yearsRunning(project)} · ${seriesStatus(project, active.state.date)}${project.pilot && project.pilot.status !== "picked_up" ? ` · pilot decision ${formatDate(project.pilot.decision)}` : ""}`
          : project.logline}
      />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Kind</dt><dd>{project.kind === "film" ? "Film" : project.format}</dd></div>
            <div><dt className="text-muted">Genre</dt><dd>{project.genres.join(" / ")}</dd></div>
            <div><dt className="text-muted">Director</dt><dd><Explain tip={`Acclaim ${project.directorAcclaim}, commercial pull ${project.directorPull}.`}>{project.directorName}</Explain></dd></div>
            <div><dt className="text-muted">Studio</dt><dd>{project.studio}</dd></div>
            <div><dt className="text-muted">Budget</dt><dd><Explain tip={`${project.budgetTier}. Marketing ${money(project.marketing)}.`}>{money(project.budget)}</Explain></dd></div>
            <div><dt className="text-muted">Phase</dt><dd>{phase.label}</dd></div>
            <div><dt className="text-muted">Shoot</dt><dd>{formatDate(project.shootStart)} · {project.shootWeeks} weeks</dd></div>
            <div><dt className="text-muted">{project.kind === "film" ? "Release" : "Premiere"}</dt><dd>{formatDate(project.release)}</dd></div>
            {project.criticScore != null ? <div><dt className="text-muted">Critics</dt><dd><Explain tip={project.resultWhy?.critic ?? "Critic score"}>{project.criticScore}</Explain></dd></div> : null}
            {project.audienceScore != null ? <div><dt className="text-muted">Audience</dt><dd><Explain tip={project.resultWhy?.audience ?? "Audience score"}>{project.audienceScore}</Explain></dd></div> : null}
            {project.profitLabel ? <div><dt className="text-muted">Result</dt><dd className="capitalize"><Explain tip={project.resultWhy?.profit ?? ""}>{project.sleeper ? "Sleeper hit · " : ""}{project.profitLabel}</Explain></dd></div> : null}
            {season ? <div><dt className="text-muted">Season</dt><dd>{season.number} · {season.renewal.replace("_", " ")} · {season.episodesAired}/{season.episodes} eps</dd></div> : null}
          </dl>
          <p className="mt-3 text-sm text-muted">{project.scriptNote}</p>
          {project.competitionNote ? <p className="mt-2 text-sm">{project.competitionNote}</p> : null}
        </Card>
        <Card>
          <h2 className="font-serif text-xl">Cast</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {project.cast.map((member) => (
              <li key={`${member.personId}${member.role}`}>
                <Link href={`/actors/${member.personId}`} className="hover:text-teal">{member.name}</Link>
                {" "}· {member.role} · {member.character} · {member.episodeFee ? `${money(member.episodeFee)}/ep × ${member.episodes ?? "?"} = ${money(member.fee)}` : money(member.fee)}
                {member.seriesDeal ? ` · ${member.seriesDeal.style} ${member.seriesDeal.seasons} seasons` : ""}
                {member.writtenOut ? " · written out" : ""}
                {member.isPlayerClient ? " · your client" : ""}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {(() => {
        const owned = active.state.productions?.find((row) => row.projectId === project.id);
        if (!owned?.waterfall) return null;
        return (
          <Card className="mt-4">
            <h2 className="font-serif text-xl">Profit waterfall</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {owned.waterfall.lines.map((line) => (
                <li key={line.label} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2">
                  <span>{line.label}<span className="mt-1 block text-xs text-muted">{line.note}</span></span>
                  <span>{money(line.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm"><Link href={`/productions/${owned.id}`} className="text-teal hover:underline">Open the production file</Link></p>
          </Card>
        );
      })()}
      {project.kind === "film" && project.weeklyGross.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl">Weekly domestic</h2>
          <p className="text-sm text-muted">Opening <Explain tip={project.resultWhy?.opening ?? ""}>{money(project.openingWeekend ?? 0)}</Explain> · Domestic {money(project.domesticTotal ?? 0)} · International {money(project.internationalTotal ?? 0)}</p>
          <Bars values={project.weeklyGross} format={(value) => money(value)} />
        </Card>
      ) : null}
      {project.kind === "series" && project.seasons.length > 0 ? (
        <div className="mt-4 space-y-3">
          <h2 className="font-serif text-2xl">Seasons</h2>
          {project.seasons.map((item) => (
            <Card key={item.number}>
              <h3 className="font-serif text-xl">Season {item.number}</h3>
              <p className="text-sm text-muted">
                Produced {item.producedYear ?? item.shootStart.year} · released {item.releasedYear ?? item.premiere.year} · {item.episodes} episodes · {item.episodesAired} aired · {item.renewal.replaceAll("_", " ")}
                {item.criticScore != null ? ` · critics ${item.criticScore}` : ""}
              </p>
              {item.viewership.length > 0 ? <p className="text-sm">Average {viewers(Math.round(item.viewership.reduce((sum, value) => sum + value, 0) / item.viewership.length))} viewers</p> : <p className="text-sm text-muted">No viewership yet.</p>}
              <ul className="mt-2 space-y-1 text-sm">
                {seasonCast(project, item).map((member) => (
                  <li key={`${item.number}-${member.personId}`}>
                    <Link href={`/actors/${member.personId}`} className="hover:text-teal">{member.name}</Link>
                    {" "}· {member.role} · {member.episodes} episodes
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}
      {season && season.viewership.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl">Viewership</h2>
          <p className="text-sm text-muted">{season.schedule === "binge" ? "Binge drop, episode by episode." : "Weekly episodes."} {project.network}</p>
          <Line values={season.viewership} />
          <p className="text-xs text-muted">Latest episode {viewers(season.viewership[season.viewership.length - 1] ?? 0)} viewers.</p>
        </Card>
      ) : null}
      {project.reviews.length > 0 ? (
        <div className="mt-4 space-y-2">
          {project.reviews.map((review, index) => (
            <Card key={index}>
              <p className="text-sm font-medium">{review.outlet} · {review.score}</p>
              <p className="text-sm">{review.text}</p>
            </Card>
          ))}
        </div>
      ) : null}
      {project.playerInvolved ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="font-serif text-xl">For your consideration</h2>
            <p className="text-sm text-muted">Spent so far {money(project.fycSpend)}. Publicists make the same cash count for more.</p>
            <form action={campaignAction} className="mt-3 flex gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <select name="amount" className="rounded-xl border border-line px-2 py-1 text-sm">
                <option value={100000}>$100K</option>
                <option value={250000}>$250K</option>
                <option value={500000}>$500K</option>
              </select>
              <button className={buttonClass()}>Fund</button>
            </form>
          </Card>
          {project.kind === "film" && !project.ended ? (
            <Card>
              <h2 className="font-serif text-xl">Festival strategy</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {festivals.map((festival) => (
                  <form key={festival.id} action={festivalAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="festivalId" value={festival.id} />
                    <input type="hidden" name="festival" value={festival.name} />
                    <input type="hidden" name="week" value={festival.week} />
                    <button className={buttonClass("secondary")}>{festival.name}</button>
                  </form>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Indie, mid, and micro films only. Studio movies get a no.</p>
            </Card>
          ) : null}
        </div>
      ) : null}
      <p className="mt-4 text-sm"><Link href="/slate" className="text-teal">Back to the slate</Link></p>
    </main>
  );
}

