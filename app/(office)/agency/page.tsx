import { redirect } from "next/navigation";
import { brandAction, staffAction } from "@/lib/actions";
import { Card, Explain, PageHeader, buttonClass } from "@/components/ui";
import { STAFF_INFO } from "@/engine/constants";
import { formatDate } from "@/engine";
import type { StaffRole } from "@/engine/types";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

const ROLES: StaffRole[] = ["junior_agent", "scout", "publicist", "lawyer"];

export default async function AgencyPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const monthlyPay = state.ledger.filter((entry) => entry.amount > 0).slice(0, 8).reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyCost = state.agency.rent + state.agency.staff.reduce((sum, member) => sum + STAFF_INFO[member.role].weekly * member.level * 4, 0);
  return (
    <main>
      <PageHeader title={state.agency.name} lede={`${state.agency.tier} agency · reputation ${state.agency.reputation}. Seed ${state.seed}.`} />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      {state.insolventWeeks > 0 ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">Cash is negative. Hiring is still possible only if a deal covers it. Income shows up when clients shoot.</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Cash</p><p className="font-serif text-3xl"><Explain tip="Opening cash was $400,000. Commission is a percent of the client fee, paid at the start of photography.">{money(state.agency.cash)}</Explain></p></Card>
        <Card><p className="text-sm text-muted">Recent commission</p><p className="font-serif text-3xl">{money(monthlyPay)}</p></Card>
        <Card><p className="text-sm text-muted">Monthly overhead</p><p className="font-serif text-3xl"><Explain tip="Rent plus four weeks of salaries, charged every fourth week.">{money(monthlyCost)}</Explain></p></Card>
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Staff</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {ROLES.map((role) => {
          const info = STAFF_INFO[role];
          const level = state.agency.staff.find((member) => member.role === role)?.level ?? 0;
          const cost = info.hire * (level + 1);
          return (
            <Card key={role}>
              <h3 className="font-serif text-xl">{info.title}</h3>
              <p className="text-sm text-muted">{info.blurb}</p>
              <p className="mt-2 text-sm">Level {level}/{info.max} · salary {money(info.weekly * Math.max(1, level))}/week</p>
              {level < info.max ? (
                <form action={staffAction} className="mt-3">
                  <input type="hidden" name="role" value={role} />
                  <button className={buttonClass()}>{level === 0 ? "Hire" : "Upgrade"} · {money(cost)}</button>
                </form>
              ) : <p className="mt-2 text-sm">Fully upgraded.</p>}
            </Card>
          );
        })}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Brand deals</h2>
      <div className="space-y-2">
        {state.brandDeals.filter((deal) => deal.status === "offered" || deal.status === "active").map((deal) => (
          <Card key={deal.id} id={`brand-${deal.id}`} className="scroll-mt-24">
            <p className="font-medium">{deal.personName} · {deal.brand}</p>
            <p className="text-sm text-muted">{money(deal.fee)} through {formatDate(deal.end)} · {deal.status}</p>
            {deal.status === "offered" ? (
              <div className="mt-2 flex gap-2">
                <form action={brandAction}><input type="hidden" name="id" value={deal.id} /><input type="hidden" name="accept" value="yes" /><button className={buttonClass()}>Accept</button></form>
                <form action={brandAction}><input type="hidden" name="id" value={deal.id} /><input type="hidden" name="accept" value="no" /><button className={buttonClass("secondary")}>Decline</button></form>
              </div>
            ) : null}
          </Card>
        ))}
        {state.brandDeals.length === 0 ? <p className="text-sm text-muted">Brand work shows up when a client is marketable enough.</p> : null}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Ledger</h2>
      <ul className="space-y-1 text-sm">
        {state.ledger.slice(0, 20).map((entry, index) => (
          <li key={index} className="flex justify-between gap-3 rounded-xl bg-white px-3 py-2">
            <span>{formatDate(entry.date)} · {entry.label}</span>
            <span>{money(entry.amount)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
