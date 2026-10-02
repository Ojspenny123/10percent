import Link from "next/link";
import { redirect } from "next/navigation";
import { Portrait } from "@/components/portrait";
import { Card, PageHeader } from "@/components/ui";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function RivalsPage() {
  const active = await readSlot();
  if (!active) redirect("/");
  const rows = [
    { id: "player", name: active.state.agency.name, reputation: active.state.agency.reputation, blurb: "That's you.", clients: active.state.clients.filter((client) => client.agency === "player") },
    ...active.state.rivals.map((rival) => ({
      ...rival,
      clients: active.state.clients.filter((client) => client.agency === "rival" && client.rivalId === rival.id),
    })),
  ].sort((a, b) => score(b.clients) - score(a.clients));
  return (
    <main>
      <PageHeader title="Rival agencies" lede="Ranked by the star power sitting on the roster. They sign people while you are in meetings, and they call unhappy clients." />
      <ol className="space-y-4">
        {rows.map((agency, index) => (
          <li key={agency.id}>
            <Card>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-2xl">{index + 1}. {agency.name}</h2>
                <span className="text-sm text-muted">Reputation {Math.round(agency.reputation)} · heat {Math.round(score(agency.clients))}</span>
              </div>
              <p className="text-sm text-muted">{agency.blurb}</p>
              <ul className="mt-3 flex gap-3 overflow-x-auto">
                {agency.clients.slice(0, 10).map((client) => (
                  <li key={client.personId} className="w-24 shrink-0">
                    <Link href={`/actors/${client.personId}`}>
                      <div className="aspect-[2/3] overflow-hidden rounded-xl bg-blush"><Portrait path={client.profilePath} name={client.name} /></div>
                      <p className="mt-1 truncate text-xs">{client.name}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ol>
    </main>
  );
}

function score(clients: { stats: { starPower: number } }[]): number {
  return clients.reduce((sum, client) => sum + client.stats.starPower, 0);
}
