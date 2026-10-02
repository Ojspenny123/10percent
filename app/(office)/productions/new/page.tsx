import { redirect } from "next/navigation";
import { developAction } from "@/lib/actions";
import { PageHeader, buttonClass } from "@/components/ui";
import { GENRES } from "@/engine/constants";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function NewProductionPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  return (
    <main>
      <PageHeader title="Develop" lede="Three fictional concepts come back for $8,000. The hook score stays hidden until a test screening or the release." />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      <form action={developAction} className="max-w-xl space-y-4 rounded-card border border-line bg-white p-5">
        <label className="block text-sm">Genre
          <select name="genre" className="mt-1 w-full rounded-xl border border-line px-3 py-2">
            {GENRES.map((genre) => <option key={genre}>{genre}</option>)}
          </select>
        </label>
        <label className="block text-sm">Budget tier
          <select name="tier" className="mt-1 w-full rounded-xl border border-line px-3 py-2" defaultValue="micro-indie">
            <option value="micro-indie">Micro, under $500K</option>
            <option value="indie">Low, $500K to $8M</option>
            <option value="mid">Mid</option>
            <option value="studio">Studio</option>
            <option value="tentpole">Tentpole</option>
          </select>
        </label>
        <label className="block text-sm">Shoot starts in
          <select name="shootInWeeks" className="mt-1 w-full rounded-xl border border-line px-3 py-2" defaultValue="10">
            <option value="6">6 weeks</option>
            <option value="10">10 weeks</option>
            <option value="16">16 weeks</option>
            <option value="24">24 weeks</option>
          </select>
        </label>
        <label className="block text-sm">Shoot length
          <select name="shootWeeks" className="mt-1 w-full rounded-xl border border-line px-3 py-2" defaultValue="5">
            <option value="4">4 weeks</option>
            <option value="6">6 weeks</option>
            <option value="8">8 weeks</option>
            <option value="12">12 weeks</option>
          </select>
        </label>
        <button className={buttonClass()}>Pay $8K and read the pages</button>
      </form>
    </main>
  );
}
