import { redirect } from "next/navigation";
import { Portrait } from "@/components/portrait";
import { Explain, PageHeader } from "@/components/ui";
import { preferredGenres } from "@/engine";
import { signAction } from "@/lib/actions";
import { buttonClass } from "@/components/ui";
import { loadCatalog } from "@/lib/catalog";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function DirectorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const catalog = await loadCatalog();
  const q = (params.q || "").toLowerCase();
  const directors = catalog.directors.filter((director) => !q || director.name.toLowerCase().includes(q)).slice(0, 60);
  const actorDirectors = active.state.clients.filter((client) => (client.directingCredits?.length ?? 0) > 0 || client.primaryFocus === "Director" || client.primaryFocus === "Both");
  return (
    <main>
      <PageHeader title="Directors" lede="Real directors from the TMDB cache, plus actor-directors on the file. Acclaim comes from ratings. Pull comes from popularity." />
      {actorDirectors.length ? (
        <div className="mb-6">
          <h2 className="mb-2 font-serif text-2xl">Actor-directors</h2>
          <ul className="space-y-2 text-sm">
            {actorDirectors.map((client) => (
              <li key={client.personId}><a href={`/actors/${client.personId}`} className="font-medium hover:text-teal">{client.name}</a> · {client.primaryFocus ?? "Actor"} · acclaim {client.directorAcclaim ?? "—"} · {client.directingCredits?.map((credit) => credit.title).join(", ")}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <form className="mb-4" action="/directors">
        <input name="q" defaultValue={params.q || ""} placeholder="Search directors" className="w-full max-w-md rounded-xl border border-line bg-white px-3 py-2" aria-label="Search directors" />
      </form>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted"><tr><th className="px-3 py-2"></th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Acclaim</th><th className="px-3 py-2">Pull</th><th className="px-3 py-2">Genres</th><th className="px-3 py-2">Credits</th><th className="px-3 py-2">Sign</th></tr></thead>
          <tbody>
            {directors.map((director) => (
              <tr key={director.id} className="border-b border-line">
                <td className="px-3 py-2"><div className="h-14 w-10 overflow-hidden rounded bg-blush"><Portrait path={director.profilePath} name={director.name} /></div></td>
                <td className="px-3 py-2 font-medium">{director.name}</td>
                <td className="px-3 py-2"><Explain tip={`Average rating ${director.avgRating.toFixed(1)} on directed credits.`}>{director.avgRating.toFixed(1)}</Explain></td>
                <td className="px-3 py-2"><Explain tip="TMDB popularity, used as commercial pull when they direct a fictional film.">{director.popularity.toFixed(1)}</Explain></td>
                <td className="px-3 py-2">{preferredGenres(director.genreMix).join(", ") || "—"}</td>
                <td className="px-3 py-2">{director.creditCount}</td>
                <td className="px-3 py-2">
                  <form action={signAction}>
                    <input type="hidden" name="personId" value={director.id} />
                    <input type="hidden" name="back" value={`/actors/${director.id}`} />
                    <input type="hidden" name="commission" value="10" />
                    <input type="hidden" name="years" value="2" />
                    <input type="hidden" name="exclusive" value="yes" />
                    <input type="hidden" name="exitClause" value="yes" />
                    <button className={buttonClass("secondary")}>Sign</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
