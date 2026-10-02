import Link from "next/link";
import { Portrait } from "@/components/portrait";
import { PageHeader, buttonClass } from "@/components/ui";
import { ageOn, fameFromStar, isEligible, preferredGenres, seedStats } from "@/engine";
import { signAction } from "@/lib/actions";
import { loadCatalog } from "@/lib/catalog";
import { readSlot } from "@/lib/game";
import { genderLabel } from "@/engine/people";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TalentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const catalog = await loadCatalog();
  const signed = new Map(active.state.clients.map((client) => [client.personId, client]));
  const ageMin = Number(params.ageMin || 0);
  const ageMax = Number(params.ageMax || 100);
  const page = Math.max(1, Number(params.page || 1));
  const rows = catalog.actors
    .filter((actor) => isEligible(actor, active.state.era, active.state.date.year))
    .map((actor) => {
      const stats = seedStats(actor);
      const client = signed.get(actor.id);
      const age = ageOn(actor.birthday, active.state.date);
      return {
        actor,
        stats: stats.stats,
        fame: client?.fame ?? fameFromStar(stats.stats.starPower, 0),
        genres: preferredGenres(actor.genreMix),
        age,
        agency: client?.agency ?? "unsigned",
        rival: client?.rivalId ?? null,
      };
    })
    .filter((row) => {
      if (params.q && !row.actor.name.toLowerCase().includes(params.q.toLowerCase())) return false;
      if (params.gender && String(row.actor.gender) !== params.gender) return false;
      if (params.nationality && row.actor.nationality !== params.nationality) return false;
      if (params.genre && !row.genres.includes(params.genre)) return false;
      if (params.fame && row.fame !== params.fame) return false;
      if (params.agency === "player" && row.agency !== "player") return false;
      if (params.agency === "rival" && row.agency !== "rival") return false;
      if (params.agency === "unsigned" && row.agency !== "unsigned") return false;
      if (row.age != null && (row.age < ageMin || row.age > ageMax)) return false;
      return true;
    })
    .sort((a, b) => {
      if (params.sort === "name") return a.actor.name.localeCompare(b.actor.name);
      if (params.sort === "age") return (a.age ?? 0) - (b.age ?? 0);
      return b.actor.popularity - a.actor.popularity;
    });
  const nations = [...new Set(catalog.actors.map((actor) => actor.nationality).filter(Boolean))].sort() as string[];
  const pageSize = 24;
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  return (
    <main>
      <PageHeader title="Talent" lede={`${rows.length} people fit this era and these filters. Photos are TMDB portraits.`} />
      <form className="mb-5 grid gap-2 rounded-card border border-line bg-white p-4 text-sm md:grid-cols-4" action="/talent">
        <input name="q" defaultValue={params.q || ""} placeholder="Search name" className="rounded-xl border border-line px-3 py-2 md:col-span-2" aria-label="Search by name" />
        <select name="gender" defaultValue={params.gender || ""} className="rounded-xl border border-line px-3 py-2" aria-label="Gender">
          <option value="">Any gender</option>
          <option value="1">Female</option>
          <option value="2">Male</option>
          <option value="3">Non-binary</option>
          <option value="0">Unspecified</option>
        </select>
        <select name="nationality" defaultValue={params.nationality || ""} className="rounded-xl border border-line px-3 py-2" aria-label="Nationality">
          <option value="">Any nationality</option>
          {nations.slice(0, 40).map((nation) => <option key={nation}>{nation}</option>)}
        </select>
        <select name="genre" defaultValue={params.genre || ""} className="rounded-xl border border-line px-3 py-2" aria-label="Genre strength">
          <option value="">Any genre strength</option>
          {["Drama", "Comedy", "Action", "Thriller", "Horror", "Romance", "Sci-Fi", "Crime"].map((genre) => <option key={genre}>{genre}</option>)}
        </select>
        <select name="fame" defaultValue={params.fame || ""} className="rounded-xl border border-line px-3 py-2" aria-label="Fame tier">
          <option value="">Any fame</option>
          {["Unknown", "Working", "Known", "A-list", "Icon"].map((fame) => <option key={fame}>{fame}</option>)}
        </select>
        <select name="agency" defaultValue={params.agency || ""} className="rounded-xl border border-line px-3 py-2" aria-label="Agency">
          <option value="">Any agency</option>
          <option value="unsigned">Unsigned</option>
          <option value="player">Signed here</option>
          <option value="rival">Rival</option>
        </select>
        <select name="sort" defaultValue={params.sort || "popularity"} className="rounded-xl border border-line px-3 py-2" aria-label="Sort">
          <option value="popularity">Popularity</option>
          <option value="name">Name</option>
          <option value="age">Age</option>
        </select>
        <label className="text-xs text-muted">Age min<input name="ageMin" type="number" defaultValue={params.ageMin || ""} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink" /></label>
        <label className="text-xs text-muted">Age max<input name="ageMax" type="number" defaultValue={params.ageMax || ""} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink" /></label>
        <button className={buttonClass()}>Search</button>
      </form>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {slice.map((row) => (
          <li key={row.actor.id} className="overflow-hidden rounded-card border border-line bg-white shadow-card">
            <Link href={`/actors/${row.actor.id}`} className="block aspect-[2/3] bg-blush">
              <Portrait path={row.actor.profilePath} name={row.actor.name} />
            </Link>
            <div className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/actors/${row.actor.id}`} className="font-medium leading-tight hover:text-teal">{row.actor.name}</Link>
                {row.agency === "player" ? <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs text-teal-dark">Signed</span> : null}
                {row.agency === "rival" ? <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs text-gold">Rival</span> : null}
              </div>
              <p className="text-xs text-muted">{row.fame} · {genderLabel(row.actor.gender)} · {row.age ?? "?"} · {row.actor.nationality ?? "Unknown"}</p>
              <p className="text-xs text-muted">{row.genres.join(", ") || "Genre mix still thin"}</p>
              {row.agency !== "player" ? (
                <form action={signAction} className="space-y-2 text-xs">
                  <input type="hidden" name="personId" value={row.actor.id} />
                  <input type="hidden" name="back" value={`/actors/${row.actor.id}`} />
                  <div className="flex gap-2">
                    <label> % <input name="commission" type="number" min={5} max={20} defaultValue={10} className="w-14 rounded border border-line px-1 py-1" /></label>
                    <label> yrs <input name="years" type="number" min={1} max={5} defaultValue={2} className="w-14 rounded border border-line px-1 py-1" /></label>
                  </div>
                  <label className="flex items-center gap-1"><input type="checkbox" name="exclusive" defaultChecked /> Exclusive</label>
                  <label className="flex items-center gap-1"><input type="checkbox" name="exitClause" defaultChecked /> Exit clause</label>
                  <button className={buttonClass()}>{row.agency === "rival" ? "Try to poach" : "Offer representation"}</button>
                </form>
              ) : (
                <Link href={`/actors/${row.actor.id}`} className="text-sm text-teal">Open profile</Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between text-sm">
        <p className="text-muted">Page {page} of {pages}</p>
        <div className="flex gap-3">
          {page > 1 ? <Link href={pageHref(params, page - 1)} className="text-teal">Previous</Link> : null}
          {page < pages ? <Link href={pageHref(params, page + 1)} className="text-teal">Next</Link> : null}
        </div>
      </div>
    </main>
  );
}

function pageHref(params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value && key !== "page") search.set(key, value);
  search.set("page", String(page));
  return `/talent?${search.toString()}`;
}
