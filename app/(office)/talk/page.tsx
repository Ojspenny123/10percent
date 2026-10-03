import { redirect } from "next/navigation";
import { talkPitchAction, talkResolveAction } from "@/lib/actions";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { TALK_SHOWS, formatDate } from "@/engine";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function TalkPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const clients = state.clients.filter((client) => client.agency === "player");
  return (
    <main>
      <PageHeader title="Talk shows" lede="UK and US shows only. Outcomes are described in general. No one is quoted." />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {TALK_SHOWS.map((show) => (
          <Card key={show.id}>
            <h2 className="font-serif text-xl">{show.name}</h2>
            <p className="text-sm text-muted">{show.country} · {show.kind} · reach {show.reach} · prestige {show.prestige}</p>
          </Card>
        ))}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Invites</h2>
      <div className="space-y-2">
        {(state.talkInvites ?? []).filter((row) => row.status === "pending").map((invite) => {
          const show = TALK_SHOWS.find((row) => row.id === invite.showId);
          const client = state.clients.find((row) => row.personId === invite.personId);
          return (
            <Card key={invite.id} id={`invite-${invite.id}`}>
              <p className="font-medium">{client?.name} · {show?.name}</p>
              <div className="mt-2 flex gap-2">
                <form action={talkResolveAction}><input type="hidden" name="id" value={invite.id} /><input type="hidden" name="accept" value="yes" /><button className={buttonClass()}>Accept</button></form>
                <form action={talkResolveAction}><input type="hidden" name="id" value={invite.id} /><input type="hidden" name="accept" value="no" /><button className={buttonClass("secondary")}>Decline</button></form>
              </div>
            </Card>
          );
        })}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Pitch a booking</h2>
      <form action={talkPitchAction} className="flex flex-wrap gap-2 text-sm">
        <select name="personId" className="rounded-xl border border-line px-2 py-1" aria-label="Client">
          {clients.map((client) => <option key={client.personId} value={client.personId}>{client.name}</option>)}
        </select>
        <select name="showId" className="rounded-xl border border-line px-2 py-1" aria-label="Show">
          {TALK_SHOWS.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
        </select>
        <button className={buttonClass()}>Pitch</button>
      </form>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Past appearances</h2>
      <ul className="space-y-1 text-sm">
        {(state.talkBookings ?? []).slice(0, 16).map((row) => {
          const show = TALK_SHOWS.find((item) => item.id === row.showId);
          const client = state.clients.find((item) => item.personId === row.personId);
          return <li key={row.id}>{formatDate(row.date)} · {client?.name} · {show?.name} · {row.note}</li>;
        })}
      </ul>
    </main>
  );
}
