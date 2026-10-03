import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Portrait } from "@/components/portrait";
import { Card, PageHeader } from "@/components/ui";
import { cityById } from "@/engine";
import { money } from "@/lib/format";
import { loadCatalog } from "@/lib/catalog";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function RivalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await readSlot();
  if (!active) redirect("/");
  const rival = active.state.rivals.find((row) => row.id === id);
  if (!rival) notFound();
  const catalog = await loadCatalog();
  const clients = active.state.clients.filter((client) => client.agency === "rival" && client.rivalId === rival.id);
  const notables = (rival.notableIds ?? []).map((personId) => catalog.actors.find((actor) => actor.id === personId)).filter((row) => row != null);
  return (
    <main>
      <PageHeader title={rival.name} lede={`${rival.monogram ?? ""} ${cityById(rival.cityId)?.city ?? ""} · founded ${rival.founded ?? "—"} · ${rival.strategy ?? "steady"} · relationship ${rival.relationship ?? 0}`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Roster size</p><p className="font-serif text-3xl">{rival.rosterCount ?? clients.length}</p></Card>
        <Card><p className="text-sm text-muted">Health</p><p className="font-serif text-3xl">{rival.health ?? "—"}</p></Card>
        <Card><p className="text-sm text-muted">Revenue</p><p className="font-serif text-3xl">{money(rival.revenue ?? 0)}</p></Card>
      </div>
      <p className="mb-4 text-sm">{rival.blurb} {rival.nemesis ? "A named nemesis." : ""}</p>
      <div className="flex gap-3 overflow-x-auto">
        {clients.map((client) => (
          <Link key={client.personId} href={`/actors/${client.personId}`} className="w-28 shrink-0">
            <div className="aspect-[2/3] overflow-hidden rounded-xl bg-blush"><Portrait path={client.profilePath} name={client.name} /></div>
            <p className="mt-1 truncate text-xs">{client.name}</p>
          </Link>
        ))}
        {notables.map((actor) => (
          <Link key={actor.id} href={`/actors/${actor.id}`} className="w-28 shrink-0">
            <div className="aspect-[2/3] overflow-hidden rounded-xl bg-blush"><Portrait path={actor.profilePath} name={actor.name} /></div>
            <p className="mt-1 truncate text-xs">{actor.name}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
