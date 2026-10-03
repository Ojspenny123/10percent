import Link from "next/link";
import { eventAction, readInboxAction, whatsNewAction } from "@/lib/actions";
import { Portrait } from "@/components/portrait";
import { Card, Empty, Explain, FlashBanner, MoodDot, PageHeader, buttonClass } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { readSlot } from "@/lib/game";
import { loadCatalog } from "@/lib/catalog";
import { absWeek, cashWarning, cityOf, clientAttention, clientFromCatalog, contractEnd, describeAssignment, needsAction, presentApproach } from "@/engine";
import { WHATS_NEW } from "@/lib/version";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; warn?: string; saveError?: string }> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const catalog = await loadCatalog();
  for (const approach of state.approaches) presentApproach(approach);
  const clients = state.clients.filter((client) => client.agency === "player");
  const offers = state.offers.filter((offer) => offer.status === "pending");
  const approaches = state.approaches.filter((approach) => approach.status === "pending");
  const events = state.events.filter((event) => !event.resolved);
  const upcoming = calendar(state);
  return (
    <main>
      <PageHeader title="Inbox" lede={`${state.agency.name} · ${cityOf(state).city} · ${formatDate(state.date)}`}>
        <form action={readInboxAction}>
          <button className={buttonClass("secondary")}>Mark inbox read</button>
        </form>
      </PageHeader>
      <FlashBanner notice={params.notice} error={params.error || params.saveError} warn={params.warn} />
      {state.whatsNewSeen ? null : (
        <div className="mb-4 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
          <p className="font-medium">What is new in v7</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {WHATS_NEW.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <form action={whatsNewAction} className="mt-3"><button className={buttonClass("secondary")}>Got it</button></form>
        </div>
      )}
      {cashWarning(state) ? <p className="mb-4 rounded-2xl bg-blush px-3 py-2 text-sm">{cashWarning(state)}</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Cash</p>
          <p className="font-serif text-3xl">
            <Explain tip="Commission is paid when a client starts shooting. Rent and salaries leave every four weeks.">{money(state.agency.cash)}</Explain>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Clients</p>
          <p className="font-serif text-3xl">{clients.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Open offers</p>
          <p className="font-serif text-3xl">{offers.length}</p>
        </Card>
      </div>
      {events.length > 0 ? (
        <div className="mb-6 space-y-3">
          {events.map((event) => (
            <Card key={event.id} id={`event-${event.id}`} className="scroll-mt-24 border-gold bg-gold-soft">
              <h2 className="font-serif text-2xl">{event.title}</h2>
              <p className="mt-2 text-sm">{event.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {event.choices.map((choice) => (
                  <form key={choice.id} action={eventAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="choice" value={choice.id} />
                    <button className={buttonClass()} title={choice.hint}>
                      {choice.label}
                    </button>
                  </form>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <h2 className="font-serif text-2xl">This week</h2>
          {state.lastTurn.length === 0 ? <p className="text-sm text-muted">Nothing moved yet. Advance a week.</p> : null}
          <div className="space-y-3">
            {approaches.map((approach) => {
              const person = catalog.actors.find((actor) => actor.id === approach.personId);
              const known = state.clients.find((client) => client.personId === approach.personId);
              const preview = known ?? (person ? clientFromCatalog(person, "unsigned", state.date, null) : null);
              const stats = preview?.stats;
              return (
                <Link key={approach.id} href={`/meetings/${approach.id}`} className="block rounded-2xl border border-line bg-white p-4 hover:border-teal">
                  <div className="flex gap-4">
                    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-blush">
                      <Portrait path={approach.profilePath} name={approach.name} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-serif text-xl">{approach.name} wants a meeting</p>
                          <p className="text-sm text-muted">
                            {approach.fame}
                            {stats ? ` · star ${stats.starPower} · talent ${stats.talent} · buzz ${stats.buzz}` : ""}
                          </p>
                        </div>
                        <span className={buttonClass()}>Take the meeting</span>
                      </div>
                      <p className="mt-2 text-sm">{approach.pitch}</p>
                      <p className="mt-1 text-sm text-muted">
                        Asking {approach.ask.commission}% · {approach.ask.termYears} years · {approach.ask.exclusive ? "exclusive" : "non-exclusive"} · open through {formatDate(approach.expires)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <ul className="space-y-2">
            {state.inbox.filter((item) => !item.resolved && item.kind !== "approach").slice(0, 16).map((item) => (
              <li key={item.id} className="rounded-2xl border border-line bg-white px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{item.href ? <Link href={item.href} className="hover:text-teal">{item.title}</Link> : item.title}</p>
                  <span className="text-xs text-muted">{needsAction(state, item) ? "action needed" : item.kind}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
          {clients.length === 0 && approaches.length === 0 ? (
            <Empty title="No clients yet" body="The phone is quiet because nobody knows the shop. Scout the talent list." href="/talent" action="Find someone" />
          ) : null}
        </div>
        <div className="space-y-4">
          <h2 className="font-serif text-2xl">Calendar</h2>
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <li key={item.id} className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                <p className="text-muted">{item.when}</p>
                <p className="font-medium">{item.label}</p>
              </li>
            ))}
          </ul>
          <h2 className="font-serif text-2xl">Roster heat</h2>
          {clients.slice(0, 6).map((client) => {
            const work = describeAssignment(state, client.personId);
            const flags = clientAttention(state, client);
            return (
              <Link key={client.personId} href={`/actors/${client.personId}`} className="block rounded-2xl border border-line bg-white px-4 py-3 hover:border-teal">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{client.name}</span>
                  <MoodDot mood={client.mood} />
                </div>
                <p className="text-sm text-muted">{work.title ? `${work.title} · ${work.label}` : client.fame}</p>
                {flags.length ? <p className="text-xs text-coral-dark">{flags.join(" · ")}</p> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function calendar(state: NonNullable<Awaited<ReturnType<typeof readSlot>>>["state"]) {
  const items: { id: string; when: string; label: string; abs: number }[] = [];
  const now = absWeek(state.date);
  for (const project of state.projects) {
    if (!project.playerInvolved || project.cancelled || project.ended) continue;
    items.push({ id: project.id + "r", when: formatDate(project.release), label: `${project.title} premiere / release`, abs: absWeek(project.release) });
  }
  for (const client of state.clients) {
    if (client.agency !== "player") continue;
    const end = contractEnd(client);
    if (end) items.push({ id: `c${client.personId}`, when: formatDate(end), label: `${client.name} contract ends`, abs: absWeek(end) });
  }
  for (const offer of state.offers) {
    if (offer.status !== "pending") continue;
    const project = state.projects.find((item) => item.id === offer.projectId);
    items.push({ id: offer.id, when: formatDate(offer.expires), label: `Offer expires: ${project?.title ?? "project"}`, abs: absWeek(offer.expires) });
  }
  return items.filter((item) => item.abs >= now).sort((a, b) => a.abs - b.abs).slice(0, 8);
}
