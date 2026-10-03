import { redirect } from "next/navigation";
import { execLimitsAction, hireExecAction } from "@/lib/actions";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { execsUnlocked, projectedBonus, yearNet } from "@/engine";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

const ROLES = ["CFO", "COO", "CPO", "CCO", "CMO", "GC"] as const;

export default async function ExecutivesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const profit = yearNet(state, state.date.year);
  const pool = projectedBonus(state, Math.max(0, profit));
  const share = profit > 0 ? Math.round((pool / profit) * 1000) / 10 : 0;
  return (
    <main>
      <PageHeader title="Executives" lede="CPO means Chief People Officer: pay, retention, and reviews. Bonuses are a cut of annual net profit, paid in week 2 of the next year. A loss year pays no profit bonus." />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      {!execsUnlocked(state) ? <p className="mb-4 rounded-2xl bg-gold-soft px-3 py-2 text-sm">The executive floor unlocks at Established, with four clients and reserves.</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Year profit so far</p><p className="font-serif text-3xl">{money(profit)}</p></Card>
        <Card><p className="text-sm text-muted">Projected bonus pool</p><p className="font-serif text-3xl">{money(pool)}</p></Card>
        <Card><p className="text-sm text-muted">Share of profit</p><p className="font-serif text-3xl">{share}%</p></Card>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {ROLES.map((role) => (
          <form key={role} action={hireExecAction}>
            <input type="hidden" name="role" value={role} />
            <button className={buttonClass()} disabled={state.executives?.some((row) => row.role === role)}>Hire {role}</button>
          </form>
        ))}
      </div>
      <div className="space-y-3">
        {(state.executives ?? []).map((exec) => {
          const slice = profit > 0 ? Math.round(profit * exec.bonusRate * (exec.kpi ? 1.1 : 1)) : exec.retentionBonus;
          return (
            <Card key={exec.id}>
              <h2 className="font-serif text-2xl">{exec.role} · {exec.name}</h2>
              <p className="text-sm">Skill {exec.skill} · loyalty {exec.loyalty} · greed {exec.greed} · risk appetite {Math.round(exec.risk)}</p>
              <p className="text-sm text-muted">Salary {money(exec.salary)} a week · bonus {Math.round(exec.bonusRate * 1000) / 10}% · this year {money(slice)} · contract {exec.years} years</p>
            </Card>
          );
        })}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Delegation</h2>
      <form action={execLimitsAction} className="flex flex-wrap gap-2 text-sm">
        <label>Budget cap <input name="budget" type="number" defaultValue={state.execBudget ?? 250000} className="ml-1 rounded-xl border border-line px-2 py-1" /></label>
        <label>Risk appetite <input name="risk" type="number" min={0} max={100} defaultValue={state.execRisk ?? 40} className="ml-1 rounded-xl border border-line px-2 py-1" /></label>
        <button className={buttonClass("secondary")}>Save limits</button>
      </form>
      <p className="mt-2 text-sm text-muted">Anything over these limits escalates. The COO can buy rooms inside the cap. The CCO can greenlight inside it. High bonus rates make them more aggressive.</p>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Year by year</h2>
      <ul className="space-y-1 text-sm">
        {(state.profitYears ?? []).map((row) => <li key={row.year}>{row.year}: profit {money(row.profit)} · bonuses {money(row.bonus)}</li>)}
        {(state.execNotes ?? []).slice(0, 8).map((note, index) => <li key={index} className="text-muted">{note.text}</li>)}
      </ul>
    </main>
  );
}
