import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Empty, PageHeader, buttonClass } from "@/components/ui";
import { tierLabel } from "@/engine";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function ProductionsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const rows = active.state.productions ?? [];
  return (
    <main>
      <PageHeader title="Productions" lede="Develop a picture, attach real people, and pay for it from cash, a loan, investors, or a studio pre-sale.">
        <Link href="/productions/new" className={buttonClass()}>Develop a film</Link>
      </PageHeader>
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      {rows.length === 0 ? <Empty title="No pictures in house" body="Micro and low budgets are the ones this shop can afford at the start. Studio films wait on reserves." href="/productions/new" action="Start development" /> : (
        <div className="space-y-3">
          {rows.map((row) => {
            const concept = row.concepts[row.conceptIndex ?? 0];
            const title = row.conceptIndex == null ? "Untitled development" : concept?.title ?? "Untitled";
            return (
              <Card key={row.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/productions/${row.id}`} className="font-serif text-2xl hover:text-teal">{title}</Link>
                  <span className="text-sm text-muted">{tierLabel(row.tier)} · {row.stage}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{row.genre}{row.budget ? ` · negative cost ${money(row.budget)}` : ""}{row.sleeper ? " · sleeper hit" : ""}</p>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
