import { createGameAction, loadSlotAction } from "@/lib/actions";
import { buttonClass, FlashBanner } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { listSlots } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const params = await searchParams;
  const slots = await listSlots();
  const bySlot = new Map(slots.map((slot) => [slot.slot, slot]));
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-coral-dark">A talent agency</p>
      <h1 className="mt-2 font-serif text-5xl text-ink sm:text-6xl">Ten Percent</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Sign real actors. Book them into films and series that do not exist yet. Take ten percent, and try not to lose them.
      </p>
      <FlashBanner error={params.error} notice={params.notice} />
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form action={createGameAction} className="rounded-card border border-line bg-white p-6 shadow-card">
          <h2 className="font-serif text-2xl">Open a shop</h2>
          <label className="mt-4 block text-sm">
            Agency name
            <input name="name" required minLength={2} defaultValue="Paper Lantern" className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
          </label>
          <fieldset className="mt-4">
            <legend className="text-sm">Start era</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                ["1990s", "1995", "Working-age actors of the mid-90s."],
                ["2000s", "2005", "The mid-2000s roster."],
                ["today", "2026", "Whoever is working now."],
              ].map(([value, year, copy]) => (
                <label key={value} className="rounded-2xl border border-line bg-paper p-3 text-sm">
                  <input type="radio" name="era" value={value} defaultChecked={value === "today"} className="mr-2" />
                  <span className="font-medium">{year}</span>
                  <span className="mt-1 block text-muted">{copy}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 block text-sm">
            Save slot
            <select name="slot" className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" defaultValue="1">
              {[1, 2, 3, 4, 5].map((slot) => (
                <option key={slot} value={slot}>
                  Slot {slot}
                  {bySlot.get(slot) ? ` · replaces ${bySlot.get(slot)!.agencyName}` : " · empty"}
                </option>
              ))}
            </select>
          </label>
          <button className={`${buttonClass()} mt-5`}>Start the agency</button>
          <p className="mt-3 text-xs text-muted">Opening cash is $400,000. The roster starts empty. Rivals already have clients.</p>
        </form>
        <div className="space-y-3">
          <h2 className="font-serif text-2xl">Saves</h2>
          {[1, 2, 3, 4, 5].map((slot) => {
            const saved = bySlot.get(slot);
            return (
              <div key={slot} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
                <div>
                  <p className="font-medium">{saved ? saved.agencyName : `Slot ${slot}`}</p>
                  <p className="text-sm text-muted">
                    {saved ? `${saved.era} · ${formatDate({ year: saved.year, week: saved.week })}` : "Empty"}
                  </p>
                </div>
                {saved ? (
                  <form action={loadSlotAction}>
                    <input type="hidden" name="id" value={saved.id} />
                    <button className={buttonClass("secondary")}>Continue</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
