import { redirect } from "next/navigation";
import { assignPublicistAction, hirePublicistAction, publicityAction } from "@/lib/actions";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

const KINDS = ["press", "charity", "interviews", "social", "brand", "crisis", "fyc"] as const;

export default async function PublicistsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const clients = state.clients.filter((client) => client.agency === "player");
  return (
    <main>
      <PageHeader title="Publicists" lede="General, digital, and social. Campaigns move buzz, reputation, reach, and awards heat." />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["General", "Digital", "Social"] as const).map((kind) => (
          <form key={kind} action={hirePublicistAction}>
            <input type="hidden" name="kind" value={kind} />
            <button className={buttonClass()}>Hire {kind} · $20K</button>
          </form>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(state.publicists ?? []).map((row) => (
          <Card key={row.id}>
            <h2 className="font-serif text-2xl">{row.name}</h2>
            <p className="text-sm text-muted">{row.kind} · level {row.level} · {money(row.salary)} a week</p>
            <form action={assignPublicistAction} className="mt-3 flex gap-2 text-sm">
              <input type="hidden" name="id" value={row.id} />
              <select name="personId" defaultValue={row.personId ?? ""} className="rounded-xl border border-line px-2 py-1" aria-label="Assign publicist">
                <option value="">Whole agency</option>
                {clients.map((client) => <option key={client.personId} value={client.personId}>{client.name}</option>)}
              </select>
              <button className={buttonClass("secondary")}>Assign</button>
            </form>
          </Card>
        ))}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Launch a campaign</h2>
      <form action={publicityAction} className="flex flex-wrap gap-2 text-sm">
        <select name="kind" className="rounded-xl border border-line px-2 py-1" aria-label="Campaign">
          {KINDS.map((kind) => <option key={kind}>{kind}</option>)}
        </select>
        <select name="personId" className="rounded-xl border border-line px-2 py-1" aria-label="Client">
          {clients.map((client) => <option key={client.personId} value={client.personId}>{client.name}</option>)}
        </select>
        <button className={buttonClass()}>Start</button>
      </form>
      <ul className="mt-4 space-y-2 text-sm">
        {(state.campaigns ?? []).map((row) => (
          <li key={row.id} className="rounded-xl bg-white px-3 py-2">{row.kind} · {money(row.cost)} · {row.weeksLeft} weeks left {row.note ? `· ${row.note}` : ""}</li>
        ))}
      </ul>
    </main>
  );
}
