import Link from "next/link";
import { redirect } from "next/navigation";
import { renewAction } from "@/lib/actions";
import { Card, Empty, PageHeader, buttonClass } from "@/components/ui";
import { contractEnd, formatDate } from "@/engine";
import { billingLabel, money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const active = await readSlot();
  if (!active) redirect("/");
  const clients = active.state.clients.filter((client) => client.agency === "player" && client.contract);
  const deals = active.state.projects.flatMap((project) =>
    project.cast
      .filter((member) => member.isPlayerClient && member.active && !member.writtenOut)
      .map((member) => ({ project, member })),
  );
  return (
    <main>
      <PageHeader title="Contracts" lede="Representation deals, and the jobs those deals are currently earning on." />
      {clients.length === 0 ? <Empty title="No representation deals" body="Sign someone from Talent. Commission only arrives when they work." href="/talent" action="Find a client" /> : (
        <div className="space-y-3">
          {clients.map((client) => {
            const end = contractEnd(client);
            return (
              <Card key={client.personId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/actors/${client.personId}?tab=contract`} className="font-serif text-xl hover:text-teal">{client.name}</Link>
                  <span className="text-sm text-muted">{client.contract?.commission}% · ends {end ? formatDate(end) : "—"}</span>
                </div>
                <form action={renewAction} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
                  <input type="hidden" name="personId" value={client.personId} />
                  <label>% <input name="commission" type="number" min={5} max={20} defaultValue={client.contract?.commission} className="w-16 rounded border border-line px-2 py-1" /></label>
                  <label>Years <input name="years" type="number" min={1} max={5} defaultValue={client.contract?.termYears ?? 2} className="w-16 rounded border border-line px-2 py-1" /></label>
                  <label className="flex items-center gap-1"><input type="checkbox" name="exclusive" defaultChecked={client.contract?.exclusive} /> Exclusive</label>
                  <label className="flex items-center gap-1"><input type="checkbox" name="exitClause" defaultChecked={client.contract?.exitClause} /> Exit clause</label>
                  <button className={buttonClass("secondary")}>Renew</button>
                </form>
              </Card>
            );
          })}
        </div>
      )}
      <h2 className="mb-3 mt-8 font-serif text-2xl">Project deals</h2>
      {deals.length === 0 ? <p className="text-sm text-muted">No one is attached to a fictional project yet.</p> : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted"><tr><th className="px-3 py-2">Client</th><th className="px-3 py-2">Project</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Fee</th><th className="px-3 py-2">Billing</th><th className="px-3 py-2">Backend</th></tr></thead>
            <tbody>
              {deals.map(({ project, member }) => (
                <tr key={`${project.id}${member.personId}`} className="border-b border-line">
                  <td className="px-3 py-2">{member.name}</td>
                  <td className="px-3 py-2"><Link href={`/projects/${project.id}`} className="hover:text-teal">{project.title}</Link></td>
                  <td className="px-3 py-2">{member.role}</td>
                  <td className="px-3 py-2" title="Paid to the client. Your commission is this times their rate, collected when photography starts.">{money(member.fee)}</td>
                  <td className="px-3 py-2">{billingLabel(member.billing)}</td>
                  <td className="px-3 py-2">{member.backend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
