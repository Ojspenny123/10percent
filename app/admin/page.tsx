import Link from "next/link";
import { SeedConsole } from "@/components/seed-console";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Seed" };

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <PageHeader
        title="Seed the cache"
        lede="Each batch is one TMDB slice, so a host that cannot run npm run seed can finish the cache from here. Use the ADMIN_SECRET from the server environment."
      />
      <SeedConsole />
      <p className="mt-6 text-sm">
        <Link href="/data" className="text-teal hover:underline">Inspect the cache</Link>
      </p>
    </main>
  );
}
