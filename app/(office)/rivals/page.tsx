import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { cityById, leagueScore } from "@/engine";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function RivalsPage({ searchParams }: { searchParams: Promise<{ q?: string; city?: string; size?: string }> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const playerClients = state.clients.filter((client) => client.agency === "player");
  const rows = [
    {
      id: "player",
      name: state.agency.name,
      reputation: state.agency.reputation,
      blurb: "That is you.",
      cityId: state.agency.cityId,
      size: "boutique" as const,
      specialty: "Both",
      strategy: "Player",
      score: leagueScore({ reputation: state.agency.reputation, clients: playerClients, revenue: 0 }),
    },
    ...state.rivals.map((rival) => ({
      ...rival,
      score: leagueScore({
        ...rival,
        clients: state.clients.filter((client) => client.agency === "rival" && client.rivalId === rival.id),
      }),
    })),
  ]
    .filter((row) => !params.q || row.name.toLowerCase().includes(params.q.toLowerCase()))
    .filter((row) => !params.city || row.cityId === params.city)
    .filter((row) => !params.size || row.size === params.size)
    .sort((a, b) => b.score - a.score);
  const cities = [...new Set(state.rivals.map((row) => row.cityId).filter(Boolean))] as string[];
  return (
    <main>
      <PageHeader title="Rival agencies" lede={`${state.rivals.length} fictional shops. Ranked by roster, revenue, awards, and box office. You start near the bottom of your city.`} />
      <form className="mb-4 flex flex-wrap gap-2 text-sm" action="/rivals">
        <input name="q" defaultValue={params.q || ""} placeholder="Search" className="rounded-xl border border-line px-3 py-2" aria-label="Search rivals" />
        <select name="city" defaultValue={params.city || ""} className="rounded-xl border border-line px-3 py-2" aria-label="City">
          <option value="">Any city</option>
          {cities.map((id) => <option key={id} value={id}>{cityById(id)?.city ?? id}</option>)}
        </select>
        <select name="size" defaultValue={params.size || ""} className="rounded-xl border border-line px-3 py-2" aria-label="Size">
          <option value="">Any size</option>
          <option value="mega">Mega</option>
          <option value="mid">Mid</option>
          <option value="boutique">Boutique</option>
        </select>
        <button className="rounded-full bg-teal px-4 py-2 text-white">Filter</button>
      </form>
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.id}>
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-2xl">{index + 1}. {row.id === "player" ? row.name : <Link href={`/rivals/${row.id}`} className="hover:text-teal">{row.name}</Link>}</h2>
                <span className="text-sm text-muted">Score {row.score}</span>
              </div>
              <p className="text-sm text-muted">{cityById(row.cityId)?.city} · {row.size} · {row.specialty} · {row.strategy}</p>
              <p className="text-sm">{row.blurb}</p>
            </Card>
          </li>
        ))}
      </ol>
    </main>
  );
}
