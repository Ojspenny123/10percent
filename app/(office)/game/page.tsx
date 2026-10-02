import { deleteSlotAction, loadSlotAction, saveAsAction, saveNowAction } from "@/lib/actions";
import { buttonClass, FlashBanner, PageHeader } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { listSlots, readSlot } from "@/lib/game";
import { savedLabel } from "@/lib/save-diff";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GamePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const slots = await listSlots();
  const now = Date.now();
  return (
    <main>
      <PageHeader title="Game" lede="Autosave writes to the open slot after every week and every major decision. The other slots stay where you left them." />
      <FlashBanner notice={params.notice} error={params.error} />
      <div className="mb-6 flex flex-wrap gap-2">
        <form action={saveNowAction}>
          <input type="hidden" name="back" value="/game" />
          <button className={buttonClass()}>Save now</button>
        </form>
        <form action={saveAsAction}>
          <button className={buttonClass("secondary")}>Save as new slot</button>
        </form>
      </div>
      <div className="space-y-3">
        {slots.map((slot) => {
          const current = slot.id === active.id;
          return (
            <article key={slot.id} className={`rounded-2xl border px-4 py-4 ${current ? "border-teal bg-teal-soft" : "border-line bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{slot.agencyName} {current ? "· open slot" : ""}</p>
                  <p className="text-sm text-muted">Slot {slot.slot} · {slot.era} · {formatDate({ year: slot.year, week: slot.week })}</p>
                  <p className="text-sm text-muted">{money(slot.cash)} · {slot.roster} on the roster · {savedLabel(slot.savedAt, now)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {current ? null : (
                    <form action={loadSlotAction}>
                      <input type="hidden" name="id" value={slot.id} />
                      <button className={buttonClass()}>Load game</button>
                    </form>
                  )}
                  <form action={deleteSlotAction}>
                    <input type="hidden" name="id" value={slot.id} />
                    <button className={buttonClass("danger")}>Delete slot</button>
                  </form>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
