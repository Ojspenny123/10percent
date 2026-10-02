import Link from "next/link";
import { Portrait } from "@/components/portrait";
import { Empty, MoodDot, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { absWeek, clientAttention, contractEnd, describeAssignment } from "@/engine";
import type { Client, FameTier, Mood, WorkStatus } from "@/engine/types";
import { readSlot } from "@/lib/game";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const FAME: FameTier[] = ["Unknown", "Working", "Known", "A-list", "Icon"];
const MOODS: Mood[] = ["Thrilled", "Content", "Uneasy", "Unhappy", "Furious"];
const STATUSES: WorkStatus[] = ["AVAILABLE", "IN_PREP", "SHOOTING", "POST_PRODUCTION", "AIRING"];

export default async function RosterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const view = params.view === "list" ? "list" : "grid";
  const clients = active.state.clients
    .filter((client) => client.agency === "player")
    .map((client) => ({ client, work: describeAssignment(active.state, client.personId), flags: clientAttention(active.state, client) }))
    .filter(({ client, work }) => {
      if (params.status && work.status !== params.status) return false;
      if (params.fame && client.fame !== params.fame) return false;
      if (params.mood && client.mood !== params.mood) return false;
      if (params.genre && !client.preferredGenres.includes(params.genre)) return false;
      if (params.expiring === "1") {
        const end = contractEnd(client);
        if (!end) return false;
        if (absWeek(end) - absWeek(active.state.date) > 16) return false;
      }
      return true;
    })
    .sort((a, b) => sortClients(a.client, b.client, params.sort));

  const genres = [...new Set(active.state.clients.filter((c) => c.agency === "player").flatMap((c) => c.preferredGenres))].sort();
  const query = (next: Record<string, string | undefined>) => {
    const merged = { ...params, ...next };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
    return `/roster?${search.toString()}`;
  };

  return (
    <main>
      <PageHeader title="Roster" lede="Everyone you represent. Status follows prep and shooting. Post-production leaves them free.">
        <div className="flex gap-2 text-sm">
          <Link href={query({ view: "grid" })} className={view === "grid" ? "font-medium text-coral-dark" : "text-muted"}>Grid</Link>
          <Link href={query({ view: "list" })} className={view === "list" ? "font-medium text-coral-dark" : "text-muted"}>List</Link>
        </div>
      </PageHeader>
      <form className="mb-5 flex flex-wrap gap-2 text-sm" action="/roster">
        <input type="hidden" name="view" value={view} />
        <select name="status" defaultValue={params.status || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
        <select name="fame" defaultValue={params.fame || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Fame">
          <option value="">Any fame</option>
          {FAME.map((fame) => <option key={fame}>{fame}</option>)}
        </select>
        <select name="mood" defaultValue={params.mood || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Mood">
          <option value="">Any mood</option>
          {MOODS.map((mood) => <option key={mood}>{mood}</option>)}
        </select>
        <select name="genre" defaultValue={params.genre || ""} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Genre">
          <option value="">Any genre</option>
          {genres.map((genre) => <option key={genre}>{genre}</option>)}
        </select>
        <select name="sort" defaultValue={params.sort || "name"} className="rounded-full border border-line bg-white px-3 py-2" aria-label="Sort">
          <option value="name">Name</option>
          <option value="fame">Fame</option>
          <option value="mood">Mood</option>
          <option value="contract">Contract end</option>
        </select>
        <label className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2">
          <input type="checkbox" name="expiring" value="1" defaultChecked={params.expiring === "1"} />
          Expiring
        </label>
        <button className="rounded-full bg-ink px-3 py-2 text-white">Filter</button>
      </form>
      {clients.length === 0 ? (
        <Empty title="Nobody on the books" body="Scout an actor, or wait for someone to walk in once the shop has a reputation." href="/talent" action="Search talent" />
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {clients.map(({ client, work, flags }) => (
            <li key={client.personId}>
              <Link href={`/actors/${client.personId}`} className="block overflow-hidden rounded-card border border-line bg-white shadow-card hover:border-teal">
                <div className="aspect-[2/3] bg-blush">
                  <Portrait path={client.profilePath} name={client.name} />
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium leading-tight">{client.name}</h2>
                    <StatusBadge status={work.status} />
                  </div>
                  <p className="text-xs text-muted">{client.fame}</p>
                  <MoodDot mood={client.mood} />
                  {work.title && work.status !== "AVAILABLE" ? (
                    <div>
                      <p className="truncate text-xs">{work.title}</p>
                      <p className="text-xs text-muted">{work.label}</p>
                      <Progress value={work.progress} />
                    </div>
                  ) : null}
                  {flags.length ? <p className="text-xs font-medium text-coral-dark">{flags.join(" · ")}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Fame</th>
                <th className="px-3 py-2">Mood</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(({ client, work, flags }) => (
                <tr key={client.personId} className="border-b border-line last:border-0">
                  <td className="px-3 py-2"><Link href={`/actors/${client.personId}`} className="font-medium hover:text-teal">{client.name}</Link></td>
                  <td className="px-3 py-2">{client.fame}</td>
                  <td className="px-3 py-2"><MoodDot mood={client.mood} /></td>
                  <td className="px-3 py-2"><StatusBadge status={work.status} /></td>
                  <td className="px-3 py-2">{work.title ? `${work.title} · ${work.label}` : "—"}</td>
                  <td className="px-3 py-2 text-coral-dark">{flags.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function sortClients(a: Client, b: Client, sort: string | undefined): number {
  if (sort === "fame") return b.stats.starPower - a.stats.starPower;
  if (sort === "mood") return a.mood.localeCompare(b.mood);
  if (sort === "contract") {
    const ae = contractEnd(a);
    const be = contractEnd(b);
    return (ae ? absWeek(ae) : 9e6) - (be ? absWeek(be) : 9e6);
  }
  return a.name.localeCompare(b.name);
}
