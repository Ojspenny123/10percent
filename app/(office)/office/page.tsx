import { redirect } from "next/navigation";
import { officeTierAction, relocateAction, satelliteAction, upgradeAction } from "@/lib/actions";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { CITIES, OFFICE_UPGRADES, cityOf, hasUpgrade, nextOfficeTier } from "@/engine";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function OfficePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const city = cityOf(state);
  const nextTier = nextOfficeTier(state);
  const groups = [...new Set(OFFICE_UPGRADES.map((row) => row.group))];
  return (
    <main>
      <PageHeader title="Office" lede={`${city.city}, ${city.country}. ${state.agency.officeTier ?? "Starter"} floor. Tentpole offers: ${city.tentpole}.`} />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Market</p><p className="font-serif text-2xl">{city.hub}</p><p className="text-sm text-muted">{city.pros}</p></Card>
        <Card><p className="text-sm text-muted">Monthly rent</p><p className="font-serif text-2xl">{money(state.agency.rent)}</p><p className="text-sm text-muted">{city.cons}</p></Card>
        <Card>
          <p className="text-sm text-muted">Tier</p>
          <p className="font-serif text-2xl">{state.agency.officeTier}</p>
          {nextTier ? (
            <form action={officeTierAction} className="mt-2">
              <button className={buttonClass()}>Next upgrade · {nextTier.tier} · {money(nextTier.cost)}</button>
            </form>
          ) : <p className="text-sm text-muted">Flagship.</p>}
        </Card>
      </div>
      {state.agency.relocating ? <p className="mb-4 rounded-2xl bg-gold-soft px-3 py-2 text-sm">Moving. The new city opens on the date already set.</p> : null}
      {groups.map((group) => (
        <section key={group} className="mb-6">
          <h2 className="mb-3 font-serif text-2xl">{group}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {OFFICE_UPGRADES.filter((row) => row.group === group).map((row) => {
              const owned = hasUpgrade(state, row.id);
              return (
                <Card key={row.id} className={owned ? "border-teal bg-teal-soft" : ""}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-serif text-xl">{row.name}</h3>
                    <span className="text-xs uppercase tracking-wide text-muted">{owned ? "Owned" : "Available"}</span>
                  </div>
                  <p className="mt-1 text-sm">{row.effect}</p>
                  <p className="mt-2 text-sm text-muted">Cost {money(row.cost)} · upkeep {money(row.upkeep)} a week</p>
                  {owned ? null : (
                    <form action={upgradeAction} className="mt-3">
                      <input type="hidden" name="id" value={row.id} />
                      <button className={buttonClass()}>Build</button>
                    </form>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
      <h2 className="mb-3 font-serif text-2xl">Move or open a satellite</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="font-serif text-xl">Relocate</h3>
          <p className="text-sm text-muted">Expensive, eight weeks, and every client loses a little loyalty.</p>
          <form action={relocateAction} className="mt-3 space-y-2">
            <select name="cityId" className="w-full rounded-xl border border-line px-3 py-2" aria-label="New city">
              {CITIES.filter((row) => row.id !== city.id).map((row) => <option key={row.id} value={row.id}>{row.city} · tentpoles {row.tentpole}</option>)}
            </select>
            <button className={buttonClass("secondary")}>Start the move</button>
          </form>
        </Card>
        <Card>
          <h3 className="font-serif text-xl">Satellite</h3>
          <p className="text-sm text-muted">Unlocks at Established. Own rent, own rooms.</p>
          <form action={satelliteAction} className="mt-3 space-y-2">
            <select name="cityId" className="w-full rounded-xl border border-line px-3 py-2" aria-label="Satellite city">
              {CITIES.filter((row) => row.id !== city.id).map((row) => <option key={row.id} value={row.id}>{row.city}</option>)}
            </select>
            <button className={buttonClass()}>Open for $80K</button>
          </form>
          <ul className="mt-3 text-sm">
            {(state.agency.satellites ?? []).map((row) => <li key={row.cityId}>{CITIES.find((cityRow) => cityRow.id === row.cityId)?.city} · rent {money(row.rent)}</li>)}
          </ul>
        </Card>
      </div>
    </main>
  );
}
