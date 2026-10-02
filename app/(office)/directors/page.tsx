import { redirect } from "next/navigation";
import { Portrait } from "@/components/portrait";
import { Explain, PageHeader } from "@/components/ui";
import { preferredGenres } from "@/engine";
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
  return (
    <main>
      <PageHeader title="Directors" lede="Real directors from the TMDB cache. Acclaim comes from the average rating of films they directed. Pull comes from popularity." />
      <form className="mb-4" action="/directors">
        <input name="q" defaultValue={params.q || ""} placeholder="Search directors" className="w-full max-w-md rounded-xl border border-line bg-white px-3 py-2" aria-label="Search directors" />
      </form>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted"><tr><th className="px-3 py-2"></th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Acclaim</th><th className="px-3 py-2">Pull</th><th className="px-3 py-2">Genres</th><th className="px-3 py-2">Credits</th></tr></thead>
          <tbody>
            {directors.map((director) => (
              <tr key={director.id} className="border-b border-line">
                <td className="px-3 py-2"><div className="h-14 w-10 overflow-hidden rounded bg-blush"><Portrait path={director.profilePath} name={director.name} /></div></td>
                <td className="px-3 py-2 font-medium">{director.name}</td>
                <td className="px-3 py-2"><Explain tip={`Average rating ${director.avgRating.toFixed(1)} on directed credits.`}>{director.avgRating.toFixed(1)}</Explain></td>
                <td className="px-3 py-2"><Explain tip="TMDB popularity, used as commercial pull when they direct a fictional film.">{director.popularity.toFixed(1)}</Explain></td>
                <td className="px-3 py-2">{preferredGenres(director.genreMix).join(", ") || "—"}</td>
                <td className="px-3 py-2">{director.creditCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
