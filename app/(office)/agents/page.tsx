import Link from "next/link";
import { redirect } from "next/navigation";
import { agentSettingsAction, assignAgentAction, fireAgentAction, hireAgentAction, raiseAgentAction } from "@/lib/actions";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const { state } = active;
  const clients = state.clients.filter((client) => client.agency === "player");
  return (
    <main>
      <PageHeader title="Agents" lede="Named agents run routine offers. Big fees, franchises, pilots, and unhappy clients still come to you.">
        <form action={hireAgentAction}><button className={buttonClass()}>Hire a junior agent · $25K</button></form>
      </PageHeader>
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      <div className="space-y-4">
        {(state.agents ?? []).map((agent) => {
          const roster = clients.filter((client) => client.agentId === agent.id);
          return (
            <Card key={agent.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-2xl">{agent.name}</h2>
                <span className="text-sm text-muted">{agent.tier} · {agent.specialty} · {agent.genre}</span>
              </div>
              <p className="mt-1 text-sm">Negotiation {agent.negotiation} · network {agent.network} · judgement {agent.judgement} · loyalty {agent.loyalty}</p>
              <p className="text-sm text-muted">Salary {money(agent.salary)} a week · workload {roster.length}/{agent.capacity} · commission tracked {money(agent.earnings)}</p>
              <form action={agentSettingsAction} className="mt-3 flex flex-wrap gap-2 text-sm">
                <input type="hidden" name="id" value={agent.id} />
                <select name="autonomy" defaultValue={agent.autonomy} className="rounded-xl border border-line px-2 py-1" aria-label="Autonomy">
                  <option value="full">Full autonomy</option>
                  <option value="threshold">Ask me for big things</option>
                  <option value="important">Ask me for everything important</option>
                </select>
                <select name="tier" defaultValue={agent.tier} className="rounded-xl border border-line px-2 py-1" aria-label="Tier">
                  <option>Junior</option>
                  <option>Agent</option>
                  <option>Senior</option>
                  <option>Partner</option>
                </select>
                <input name="feeThreshold" type="number" defaultValue={agent.feeThreshold} className="w-36 rounded-xl border border-line px-2 py-1" aria-label="Fee threshold" />
                <button className={buttonClass("secondary")}>Save settings</button>
              </form>
              <div className="mt-3 flex gap-2">
                <form action={raiseAgentAction}><input type="hidden" name="id" value={agent.id} /><button className={buttonClass("secondary")}>Give a raise</button></form>
                <form action={fireAgentAction}><input type="hidden" name="id" value={agent.id} /><button className={buttonClass("danger")}>Fire</button></form>
              </div>
              <ul className="mt-3 text-sm">
                {roster.map((client) => <li key={client.personId}><Link href={`/actors/${client.personId}`} className="hover:text-teal">{client.name}</Link></li>)}
                {roster.length === 0 ? <li className="text-muted">No clients assigned.</li> : null}
              </ul>
            </Card>
          );
        })}
        {(state.agents ?? []).length === 0 ? <p className="text-sm text-muted">No agents yet. Unassigned clients stay with you.</p> : null}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Assign the roster</h2>
      <div className="space-y-2">
        {clients.map((client) => (
          <form key={client.personId} action={assignAgentAction} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
            <input type="hidden" name="personId" value={client.personId} />
            <input type="hidden" name="back" value="/agents" />
            <span className="min-w-40">{client.name}</span>
            <select name="agentId" defaultValue={client.agentId ?? ""} className="rounded-xl border border-line px-2 py-1" aria-label={`Agent for ${client.name}`}>
              <option value="">You</option>
              {(state.agents ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
            <button className={buttonClass("secondary")}>Assign</button>
          </form>
        ))}
      </div>
      <h2 className="mb-3 mt-8 font-serif text-2xl">Agent activity</h2>
      <ul className="space-y-1 text-sm">
        {(state.agentNotes ?? []).slice(0, 12).map((note, index) => <li key={index}>{note.text}</li>)}
      </ul>
    </main>
  );
}
