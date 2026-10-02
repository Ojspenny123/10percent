import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/engine";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const active = await readSlot();
  if (!active) redirect("/");
  return (
    <main>
      <PageHeader title="Industry news" lede="Headlines from fictional outlets and from whatever your clients just did. None of these are real publications." />
      <ul className="space-y-3">
        {active.state.news.map((item) => (
          <li key={item.id} className="rounded-card border border-line bg-white p-4 shadow-card">
            <p className="text-xs text-muted">{formatDate(item.date)}</p>
            <h2 className="font-serif text-2xl">{item.headline}</h2>
            <p className="mt-1 text-sm text-muted">{item.body}</p>
          </li>
        ))}
        {active.state.news.length === 0 ? <li className="text-sm text-muted">The trades are quiet.</li> : null}
      </ul>
    </main>
  );
}
