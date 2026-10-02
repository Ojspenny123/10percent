import Link from "next/link";
import { redirect } from "next/navigation";
import { emergencyLoanAction, libraryAction } from "@/lib/actions";
import { Line } from "@/components/charts";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { cashWarning, formatDate, incomeTimeline, netWorth } from "@/engine";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

const SPLIT = [
  ["film", "Upfront commissions"],
  ["backend", "Backend commissions"],
  ["bonus", "Bonuses"],
  ["series", "Series"],
  ["pilot", "Pilots"],
  ["production", "Own-production profit"],
] as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const worth = netWorth(state);
  const warning = cashWarning(state);
  const timeline = incomeTimeline(state);
  const totals = Object.fromEntries(SPLIT.map(([bucket]) => [bucket, 0])) as Record<(typeof SPLIT)[number][0], number>;
  for (const entry of state.ledger) {
    if (entry.amount === 0) continue;
    const bucket = entry.bucket ?? "other";
    if (bucket in totals) totals[bucket as keyof typeof totals] += entry.amount;
  }
  const pending = (state.payouts ?? []).filter((payout) => !payout.paid);
  const forecast = pending.reduce((sum, payout) => sum + (payout.kind === "profit" ? payout.amount : Math.round(payout.amount * payout.commissionRate / 100)), 0);
  return (
    <main>
      <PageHeader title="Finance" lede="Commission lands when the client is paid. Backend can arrive months after the opening. Own-production profit is what the waterfall leaves." />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      {warning ? <p className="mb-4 rounded-2xl bg-blush px-3 py-2 text-sm">{warning}</p> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><p className="text-sm text-muted">Cash</p><p className="font-serif text-3xl">{money(worth.cash)}</p></Card>
        <Card><p className="text-sm text-muted">Receivables</p><p className="font-serif text-3xl">{money(worth.receivables)}</p></Card>
        <Card><p className="text-sm text-muted">Debt</p><p className="font-serif text-3xl">{money(worth.debt)}</p></Card>
        <Card><p className="text-sm text-muted">Net worth</p><p className="font-serif text-3xl">{money(worth.total)}</p></Card>
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Income</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {SPLIT.map(([bucket, label]) => (
          <Card key={bucket}><p className="text-sm text-muted">{label}</p><p className="font-serif text-2xl">{money(totals[bucket])}</p></Card>
        ))}
      </div>
      <Card className="mt-4">
        <h2 className="font-serif text-xl">Over time</h2>
        <p className="text-sm text-muted">Each bar group is four in-game weeks of upfront, backend, bonuses, series, and production profit.</p>
        {timeline.length > 1 ? <Line values={timeline.map((row) => row.upfront + row.backend + row.bonus + row.series + row.production)} /> : <p className="mt-3 text-sm text-muted">The chart fills in once money moves across more than one month.</p>}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="text-muted"><th className="py-1">Period</th><th>Upfront</th><th>Backend</th><th>Bonus</th><th>Series</th><th>Production</th></tr></thead>
            <tbody>
              {timeline.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <td className="py-1">{row.label}</td>
                  <td>{money(row.upfront)}</td>
                  <td>{money(row.backend)}</td>
                  <td>{money(row.bonus)}</td>
                  <td>{money(row.series)}</td>
                  <td>{money(row.production)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Pending backend</h2>
      <p className="mb-3 text-sm text-muted">Forecast still to collect: {money(forecast)}. This is commission and production profit, not the actor gross.</p>
      <ul className="space-y-2 text-sm">
        {pending.slice(0, 12).map((payout) => (
          <li key={payout.id} className="flex justify-between gap-3 rounded-xl bg-white px-3 py-2">
            <span>{formatDate(payout.due)} · {payout.kind} · {payout.name}</span>
            <span>{money(payout.kind === "profit" ? payout.amount : Math.round(payout.amount * payout.commissionRate / 100))}</span>
          </li>
        ))}
        {pending.length === 0 ? <li className="text-muted">Nothing is waiting on a later week.</li> : null}
      </ul>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Loans</h2>
      <ul className="space-y-2 text-sm">
        {(state.loans ?? []).map((loan) => (
          <li key={loan.id} className="rounded-xl bg-white px-3 py-2">{loan.label} · balance {money(loan.balance)} · {Math.round(loan.annualRate * 100)}% a year{loan.emergency ? " · emergency terms" : ""}</li>
        ))}
        {(state.loans ?? []).length === 0 ? <li className="text-muted">No loans.</li> : null}
      </ul>
      <form action={emergencyLoanAction} className="mt-4">
        <button className={buttonClass("danger")}>Take an emergency loan at 28%</button>
      </form>
      <p className="mt-2 text-xs text-muted">Emergency money is expensive. Use it when payroll is about to outrun the account.</p>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Library</h2>
      <div className="space-y-2">
        {(state.productions ?? []).filter((row) => row.stage === "released" && !row.librarySold).map((row) => {
          const title = row.concepts[row.conceptIndex ?? 0]?.title ?? "Picture";
          return (
            <form key={row.id} action={libraryAction} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
              <input type="hidden" name="id" value={row.id} />
              <span>{title}</span>
              <button className={buttonClass("secondary")}>Sell library rights</button>
            </form>
          );
        })}
      </div>
      <p className="mt-6 text-sm"><Link href="/productions" className="text-teal hover:underline">Productions</Link></p>
    </main>
  );
}
