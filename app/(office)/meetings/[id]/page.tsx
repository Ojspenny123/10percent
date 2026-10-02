import Link from "next/link";
import { redirect } from "next/navigation";
import { Portrait } from "@/components/portrait";
import { Card, Empty, FlashBanner, PageHeader, StatBar, buttonClass } from "@/components/ui";
import { meetingAction } from "@/lib/actions";
import { loadCatalog } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { readSlot } from "@/lib/game";
import { approachBlocker, clientFromCatalog, presentApproach, rosterCap } from "@/engine";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string; warn?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const catalog = await loadCatalog();
  const approach = state.approaches.find((row) => row.id === id);
  if (!approach) {
    return (
      <main>
        <PageHeader title="Meeting" lede="This approach is not in the open save." />
        <Empty title="No meeting on the books" body="It may belong to another slot, or the week moved on without a record." href="/dashboard" action="Back to the inbox" />
      </main>
    );
  }
  presentApproach(approach);
  const person = catalog.actors.find((actor) => actor.id === approach.personId);
  const existing = state.clients.find((client) => client.personId === approach.personId);
  const preview = existing ?? (person ? clientFromCatalog(person, "unsigned", state.date, null) : null);
  const rival = existing?.rivalId ? state.rivals.find((row) => row.id === existing.rivalId) : undefined;
  const agencyStatus = existing?.agency === "player" && existing.contract
    ? "Already on your roster"
    : existing?.agency === "rival"
      ? `Signed with ${rival?.name ?? "a rival"}`
      : "Unsigned";
  const block = approachBlocker(state, approach);
  const rosterFull = Boolean(block?.includes("roster is full"));
  const hard = Boolean(block) && !rosterFull;
  const cap = rosterCap(state.agency.tier);
  const roster = state.clients.filter((client) => client.agency === "player" && client.contract).length;
  const ask = approach.ask;
  const opening = approach.opening;
  const sameAsk = opening.commission === ask.commission && opening.termYears === ask.termYears && opening.exclusive === ask.exclusive && opening.exitClause === ask.exitClause;

  return (
    <main>
      <PageHeader title={approach.name} lede={`${approach.fame} · open through ${formatDate(approach.expires)}`}>
        <Link href="/dashboard" className={buttonClass("secondary")}>Back to the inbox</Link>
      </PageHeader>
      <FlashBanner notice={query.notice} error={query.error} warn={query.warn} />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div>
          <div className="aspect-[2/3] overflow-hidden rounded-card bg-blush shadow-card">
            <Portrait path={approach.profilePath} name={approach.name} />
          </div>
          <p className="mt-3 text-sm text-muted">{approach.fame} · {preview?.careerStage ?? "Working"}</p>
        </div>
        <div className="space-y-4">
          <Card>
            <p className="font-serif text-2xl leading-snug">&ldquo;{approach.line}&rdquo;</p>
            <p className="mt-3 text-sm text-muted">{approach.pitch}</p>
            {preview ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <StatBar label="Star power" value={preview.stats.starPower} tip={preview.statWhy.starPower} />
                <StatBar label="Talent" value={preview.stats.talent} tip={preview.statWhy.talent} />
                <StatBar label="Buzz" value={preview.stats.buzz} tip={preview.statWhy.buzz} />
                <StatBar label="Marketability" value={preview.stats.marketability} tip={preview.statWhy.marketability} />
              </div>
            ) : null}
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Career stage</dt><dd>{preview?.careerStage ?? "Unknown"}</dd></div>
              <div><dt className="text-muted">Agency</dt><dd>{agencyStatus}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Preferred genres</dt><dd>{preview?.preferredGenres.join(", ") || "Still finding a lane"}</dd></div>
              <div><dt className="text-muted">Roster</dt><dd>{roster}/{cap} · {state.agency.tier}</dd></div>
              <div><dt className="text-muted">Expires</dt><dd>{formatDate(approach.expires)}</dd></div>
            </dl>
          </Card>
          <Card>
            <h2 className="font-serif text-2xl">Their ask</h2>
            <p className="mt-2 text-sm">{describeAsk(ask)}</p>
            {sameAsk ? null : <p className="mt-2 text-sm text-muted">They opened at {describeAsk(opening)}. The number on the table now is the one above.</p>}
            {approach.lastReply ? (
              <p className="mt-3 rounded-xl bg-gold-soft px-3 py-2 text-sm">{approach.lastReply.reason}</p>
            ) : null}
            {block ? <p className="mt-3 rounded-xl bg-blush px-3 py-2 text-sm">{block}</p> : null}
            {hard ? (
              <form action={meetingAction} className="mt-4">
                <input type="hidden" name="id" value={approach.id} />
                <input type="hidden" name="intent" value="decline" />
                <button className={buttonClass()}>Close this approach</button>
              </form>
            ) : (
              <div className="mt-4 space-y-4">
                <form action={meetingAction}>
                  <input type="hidden" name="id" value={approach.id} />
                  <input type="hidden" name="intent" value="accept" />
                  <button className={buttonClass()}>Accept their terms</button>
                </form>
                <form action={meetingAction} className="grid gap-3 rounded-2xl border border-line p-4 text-sm sm:grid-cols-2">
                  <input type="hidden" name="id" value={approach.id} />
                  <input type="hidden" name="intent" value="counter" />
                  <label>Commission %
                    <input name="commission" type="number" min={5} max={20} defaultValue={ask.commission} className="mt-1 w-full rounded-xl border border-line px-2 py-1" />
                  </label>
                  <label>Term (years)
                    <input name="years" type="number" min={1} max={5} defaultValue={ask.termYears} className="mt-1 w-full rounded-xl border border-line px-2 py-1" />
                  </label>
                  <label>Exclusivity
                    <select name="exclusive" defaultValue={ask.exclusive ? "yes" : "no"} className="mt-1 w-full rounded-xl border border-line px-2 py-1">
                      <option value="yes">Exclusive</option>
                      <option value="no">Non-exclusive</option>
                    </select>
                  </label>
                  <label>Exit clause
                    <select name="exitClause" defaultValue={ask.exitClause ? "yes" : "no"} className="mt-1 w-full rounded-xl border border-line px-2 py-1">
                      <option value="yes">Exit clause</option>
                      <option value="no">No exit clause</option>
                    </select>
                  </label>
                  <button className={`${buttonClass("secondary")} sm:col-span-2`}>Send counter</button>
                </form>
                <div className="flex flex-wrap gap-2">
                  <form action={meetingAction}>
                    <input type="hidden" name="id" value={approach.id} />
                    <input type="hidden" name="intent" value="decline" />
                    <button className={buttonClass("danger")}>Decline politely</button>
                  </form>
                  <Link href="/dashboard" className={buttonClass("secondary")}>Think about it</Link>
                </div>
                <p className="text-xs text-muted">Thinking about it keeps the approach open through {formatDate(approach.expires)}. Their walk-away stays off the page.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

function describeAsk(ask: { commission: number; termYears: number; exclusive: boolean; exitClause: boolean }): string {
  const years = ask.termYears === 1 ? "1 year" : `${ask.termYears} years`;
  return `${ask.commission}% commission, ${years}, ${ask.exclusive ? "exclusive" : "non-exclusive"}, ${ask.exitClause ? "with an exit clause" : "no exit clause"}.`;
}
