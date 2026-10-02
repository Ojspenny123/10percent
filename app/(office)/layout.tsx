import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const active = await readSlot();
  if (!active) redirect("/");
  return <Shell state={active.state} savedAt={active.savedAt} version={active.saveVersion}>{children}</Shell>;
}
