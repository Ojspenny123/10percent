import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Portrait } from "@/components/portrait";
import { Card, Explain, MoodDot, PageHeader, Progress, StatBar, StatusBadge, buttonClass } from "@/components/ui";
import { ageOn, describeAssignment, formatDate, phaseAt, preferenceLabel } from "@/engine";
import { genderLabel } from "@/engine/people";
import { absWeek, addWeeks, contractEnd } from "@/engine/schedule";
import { releaseAction, renewAction, signAction } from "@/lib/actions";
import { loadCatalog } from "@/lib/catalog";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function ActorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; notice?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const personId = Number(id);
  const active = await readSlot();
  if (!active) redirect("/");
  const catalog = await loadCatalog();
  const person = catalog.actors.find((actor) => actor.id === personId) ?? catalog.directors.find((actor) => actor.id === personId);
  const client = active.state.clients.find((row) => row.personId === personId);
  if (!person && !client) notFound();
  const name = client?.name ?? person?.name ?? "Actor";
  const tab = query.tab || "overview";
  const work = describeAssignment(active.state, personId);
  const projects = active.state.projects.filter((project) => project.cast.some((member) => member.personId === personId && !member.writtenOut) || project.openRole?.forPersonId === personId);
  const age = ageOn(client?.birthday ?? person?.birthday ?? null, active.state.date);
  return (
    <main>
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          <div className="aspect-[2/3] overflow-hidden rounded-card bg-blush shadow-card">
            <Portrait path={client?.profilePath ?? person?.profilePath ?? null} name={name} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={work.status} />
            {client?.agency === "player" ? <span className="rounded-full bg-teal-soft px-2.5 py-1 text-xs text-teal-dark">Signed</span> : null}
          </div>
        </div>
        <div>
          <PageHeader title={name} lede={`${client?.fame ?? "Unsigned"} · ${client?.careerStage ?? "Outside the roster"} · ${genderLabel(client?.gender ?? person?.gender ?? 0)} · ${age ?? "age unknown"} · ${client?.nationality ?? person?.nationality ?? "Nationality unknown"}`} />
          {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
          {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
          {client ? <MoodDot mood={client.mood} /> : null}
          <p className="mt-2 text-sm text-muted">{preferenceLabel(client?.nextPreference ?? "none")}</p>
          {work.title && work.status !== "AVAILABLE" ? (
            <Card className="mt-4">
              <h2 className="font-serif text-xl">Current project</h2>
              <p className="mt-1"><Link href={`/projects/${work.projectId}`} className="font-medium hover:text-teal">{work.title}</Link></p>
              <p className="text-sm text-muted">{work.label}. {work.detail}</p>
              <p className="mt-2 text-sm"><Explain tip="Progress through the current phase. Post-production and airing do not block a new job.">{work.progress}% · {work.weeksRemaining} weeks left in this phase</Explain></p>
              <Progress value={work.progress} />
            </Card>
          ) : <p className="mt-4 text-sm text-muted">No blocking job. They can take prep or a shoot.</p>}
          <nav className="mt-5 flex flex-wrap gap-3 text-sm">
            {["overview", "schedule", "verdicts", "credits", "contract", "awards"].map((item) => (
              <Link key={item} href={`/actors/${personId}?tab=${item}`} className={tab === item ? "font-medium text-coral-dark" : "text-muted capitalize"}>
                {item}
              </Link>
            ))}
          </nav>
          <div className="mt-5">
            {tab === "overview" && client ? <Overview client={client} /> : null}
            {tab === "overview" && (!client || client.agency !== "player") ? <div className="mt-4"><Unsigned personId={personId} name={name} /></div> : null}
            {tab === "schedule" ? <Schedule stateDate={active.state.date} projects={projects} personId={personId} /> : null}
            {tab === "verdicts" ? <Verdicts client={client} /> : null}
            {tab === "credits" ? <Credits client={client} person={person} projects={projects} personId={personId} /> : null}
            {tab === "contract" ? <Contract client={client} personId={personId} date={active.state.date} /> : null}
            {tab === "awards" ? <Awards client={client} /> : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function Overview({ client }: { client: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]["clients"][number] }) {
  const hints = client.revealedHints.length ? client.revealedHints : ["Nothing revealed yet. A scout, or a finished job, will surface a hint. They are not shown as numbers."];
  const max = Math.max(...client.history.map((point) => point.score), 1);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <StatBar label="Talent" value={client.stats.talent} tip={client.statWhy.talent} />
        <StatBar label="Star power" value={client.stats.starPower} tip={client.statWhy.starPower} />
        <StatBar label="Marketability" value={client.stats.marketability} tip={client.statWhy.marketability} />
        <StatBar label="Range" value={client.stats.range} tip={client.statWhy.range} />
        <StatBar label="Buzz" value={client.stats.buzz} tip={client.statWhy.buzz} />
        <StatBar label="Reputation" value={client.stats.reputation} tip={client.statWhy.reputation} />
      </Card>
      <div className="space-y-4">
        <Card>
          <h2 className="font-serif text-xl">What you have noticed</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
          <p className="mt-3 text-xs text-muted">Loyalty {client.loyalty}. Hidden preferences stay hidden until a job or a scout shows them.</p>
        </Card>
        <Card>
          <h2 className="font-serif text-xl">Fame over time</h2>
          <svg viewBox="0 0 240 80" className="mt-3 h-24 w-full" role="img" aria-label="Fame score over time">
            <polyline fill="none" stroke="#1F7A72" strokeWidth="2" points={client.history.map((point, index) => `${(index / Math.max(1, client.history.length - 1)) * 230 + 4},${76 - (point.score / max) * 68}`).join(" ")} />
          </svg>
          <p className="text-xs text-muted">Preferred genres: {client.preferredGenres.join(", ") || "—"}. Loyalty {client.loyalty}, shown because it is the relationship, not a hidden trait.</p>
        </Card>
      </div>
    </div>
  );
}

function Unsigned({ personId, name }: { personId: number; name: string }) {
  return (
    <Card>
      <h2 className="font-serif text-xl">{name} is unsigned, or with someone else</h2>
      <form action={signAction} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="back" value={`/actors/${personId}`} />
        <label>Commission %<input name="commission" type="number" min={5} max={20} defaultValue={10} className="mt-1 block w-24 rounded-xl border border-line px-2 py-1" /></label>
        <label>Years<input name="years" type="number" min={1} max={5} defaultValue={2} className="mt-1 block w-24 rounded-xl border border-line px-2 py-1" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="exclusive" defaultChecked /> Exclusive</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="exitClause" defaultChecked /> Exit clause</label>
        <button className={buttonClass()}>Offer representation</button>
      </form>
    </Card>
  );
}

function Schedule({ stateDate, projects, personId }: { stateDate: { year: number; week: number }; projects: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]["projects"]; personId: number }) {
  const rows = projects.map((project) => ({ project, phase: phaseAt(project, stateDate) })).sort((a, b) => absWeek(a.project.prepStart) - absWeek(b.project.prepStart));
  const blocked = rows.flatMap(({ project }) => {
    if (project.kind === "series") return project.seasons.map((season) => ({ start: absWeek(season.prepStart), end: absWeek(addWeeks(season.shootStart, season.shootWeeks - 1)), title: project.title }));
    return [{ start: absWeek(project.prepStart), end: absWeek(addWeeks(project.shootStart, project.shootWeeks - 1)), title: project.title }];
  });
  const gaps: string[] = [];
  let cursor = absWeek(stateDate);
  const horizon = cursor + 36;
  const ordered = blocked.sort((a, b) => a.start - b.start);
  for (const block of ordered) {
    if (block.end < cursor) continue;
    if (block.start > cursor + 3) gaps.push(`Free ${formatDate(fromAbsLocal(cursor))} to ${formatDate(fromAbsLocal(block.start - 1))}`);
    cursor = Math.max(cursor, block.end + 1);
  }
  if (horizon - cursor >= 4) gaps.push(`Free ${formatDate(fromAbsLocal(cursor))} onward`);
  return (
    <div className="space-y-3">
      <Card>
        <h2 className="font-serif text-xl">Open gaps</h2>
        {gaps.length ? <ul className="mt-2 list-disc pl-5 text-sm">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p className="text-sm text-muted">Booked solid for the next stretch.</p>}
      </Card>
      {rows.map(({ project, phase }) => (
        <Card key={project.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/projects/${project.id}`} className="font-medium hover:text-teal">{project.title}</Link>
            <StatusBadge status={phase.status === "AVAILABLE" ? "AVAILABLE" : phase.status} />
          </div>
          <p className="text-sm text-muted">{project.kind === "film" ? "Film" : project.format} · {phase.label}</p>
          <p className="text-sm">Prep {formatDate(project.prepStart)} · Shoot {formatDate(project.shootStart)} · {project.kind === "film" ? "Release" : "Premiere"} {formatDate(project.release)}</p>
          <p className="text-xs text-muted">{project.cast.find((member) => member.personId === personId)?.role} as {project.cast.find((member) => member.personId === personId)?.character}</p>
          {phase.status !== "AVAILABLE" ? <Progress value={phase.progress} /> : null}
        </Card>
      ))}
      {rows.length === 0 ? <p className="text-sm text-muted">No game credits yet. Real credits are on the credits tab.</p> : null}
    </div>
  );
}

function fromAbsLocal(n: number): { year: number; week: number } {
  return { year: Math.floor(n / 52), week: (n % 52) + 1 };
}

function Verdicts({ client }: { client: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]["clients"][number] | undefined }) {
  if (!client || client.verdicts.length === 0) return <p className="text-sm text-muted">No verdicts yet. They write one when a shoot wraps, and another after release.</p>;
  return (
    <ul className="space-y-3">
      {client.verdicts.map((verdict) => (
        <li key={verdict.id}>
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl">{verdict.projectTitle}</h2>
              <span className="text-sm">{verdict.label} · {"★".repeat(verdict.stars)}{"☆".repeat(5 - verdict.stars)}</span>
            </div>
            <p className="mt-2 text-sm">{verdict.text}</p>
            <p className="mt-1 text-xs text-muted">{verdict.phase} · {formatDate(verdict.when)}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Credits({ client, person, projects, personId }: { client: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]["clients"][number] | undefined; person: { knownFor: { title: string; year: string; character: string; rating: number; mediaType: string }[] } | undefined; projects: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]["projects"]; personId: number }) {
  const real = client?.realCredits ?? person?.knownFor ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="font-serif text-xl">Before the agency</h2>
        <p className="text-xs text-muted">Real credits cached from TMDB. Not part of this game.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {real.map((credit) => <li key={`${credit.title}${credit.year}`}>{credit.year} · {credit.title} {credit.character ? `as ${credit.character}` : ""} <Explain tip="TMDB vote average on that title.">({credit.rating.toFixed(1)})</Explain></li>)}
          {real.length === 0 ? <li className="text-muted">No cached credits.</li> : null}
        </ul>
      </Card>
      <Card>
        <h2 className="font-serif text-xl">With you</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {projects.map((project) => {
            const member = project.cast.find((row) => row.personId === personId);
            return <li key={project.id}><Link href={`/projects/${project.id}`} className="hover:text-teal">{project.title}</Link> · {member?.role} · {project.genres[0]}</li>;
          })}
          {projects.length === 0 ? <li className="text-muted">No fictional credits yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}

function Contract({ client, personId, date }: { client: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]["clients"][number] | undefined; personId: number; date: { year: number; week: number } }) {
  if (!client || client.agency !== "player" || !client.contract) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted">{client?.agency === "unsigned" ? "The old deal lapsed. Their file is still here." : "No representation deal on file."}</p>
        <Unsigned personId={personId} name={client?.name ?? "This actor"} />
      </div>
    );
  }
  const end = contractEnd(client);
  return (
    <Card>
      <p>{client.contract.commission}% commission · {client.contract.termYears} years · {client.contract.exclusive ? "Exclusive" : "Non-exclusive"} · {client.contract.exitClause ? "Exit clause" : "No exit clause"}</p>
      <p className="text-sm text-muted">Started {formatDate(client.contract.start)}. Ends {end ? formatDate(end) : "—"}. Today is {formatDate(date)}.</p>
      <form action={renewAction} className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="personId" value={personId} />
        <label>% <input name="commission" type="number" min={5} max={20} defaultValue={client.contract.commission} className="w-16 rounded border border-line px-2 py-1" /></label>
        <label>Years <input name="years" type="number" min={1} max={5} defaultValue={client.contract.termYears} className="w-16 rounded border border-line px-2 py-1" /></label>
        <label className="flex items-center gap-1"><input type="checkbox" name="exclusive" defaultChecked={client.contract.exclusive} /> Exclusive</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="exitClause" defaultChecked={client.contract.exitClause} /> Exit clause</label>
        <button className={buttonClass()}>Renew</button>
      </form>
      <form action={releaseAction} className="mt-3">
        <input type="hidden" name="personId" value={personId} />
        <button className={buttonClass("danger")}>Release them</button>
      </form>
    </Card>
  );
}

function Awards({ client }: { client: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]["clients"][number] | undefined }) {
  if (!client || client.awards.length === 0) return <p className="text-sm text-muted">No nominations yet. Late-year releases and campaigns help.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {client.awards.map((award, index) => (
        <li key={`${award.ceremony}${award.year}${index}`} className="rounded-2xl border border-line bg-white px-4 py-3">
          <span className="font-medium">{award.result === "won" ? "Won" : "Nominated"}</span> {award.category} · {award.ceremony} {award.year} · {award.projectTitle}
        </li>
      ))}
    </ul>
  );
}

