import Link from "next/link";
import { acceptOfferAction, counterOfferAction, declineOfferAction } from "@/lib/actions";
import { Card, Empty, Explain, FlashBanner, PageHeader, buttonClass } from "@/components/ui";
import { formatDate, pendingConflictMessage } from "@/engine";
import { backendLabel, billingLabel, money } from "@/lib/format";
import { readSlot } from "@/lib/game";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ offer?: string; notice?: string; error?: string; warn?: string; saveError?: string; status?: string }> }) {
  const params = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const status = params.status || "pending";
  const offers = active.state.offers.filter((offer) => (status === "all" ? true : offer.status === status));
  const selected = (params.offer ? active.state.offers.find((offer) => offer.id === params.offer) : undefined) ?? offers[0];
  const project = selected ? active.state.projects.find((item) => item.id === selected.projectId) : undefined;
  const client = selected ? active.state.clients.find((item) => item.personId === selected.personId) : undefined;
  const conflict = selected && project && client ? pendingConflictMessage(active.state, client.personId, project, selected.blocks) : null;
  return (
    <main>
      <PageHeader title="Offers" lede="Studios send these about a specific client. A greedy counter can kill the deal. The actor can still say no." />
      <FlashBanner notice={params.notice} error={params.error || params.saveError} warn={params.warn} />
      <div className="mb-4 flex gap-3 text-sm">
        {["pending", "accepted", "declined", "expired", "killed", "actor_refused", "all"].map((item) => (
          <Link key={item} href={`/offers?status=${item}`} className={status === item ? "font-medium text-coral-dark" : "text-muted"}>{item.replace("_", " ")}</Link>
        ))}
      </div>
      {!selected && offers.length === 0 ? <Empty title="No offers in this pile" body="Advance the week. Volume follows fame, buzz, reputation, and junior agents." href="/dashboard" action="Back to the inbox" /> : (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <ul className="space-y-2">
            {offers.map((offer) => {
              const title = active.state.projects.find((item) => item.id === offer.projectId)?.title ?? "Project";
              const who = active.state.clients.find((item) => item.personId === offer.personId)?.name ?? "Client";
              return (
                <li key={offer.id}>
                  <Link href={`/offers?status=${status}&offer=${offer.id}`} className={`block rounded-2xl border px-4 py-3 ${selected?.id === offer.id ? "border-teal bg-teal-soft" : "border-line bg-white"}`}>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted">{who} · {offer.role} · {offer.pay === "episode" && offer.episodeFee ? `${money(offer.episodeFee)}/ep` : money(offer.fee)}{offer.pay === "pilot" ? " · pilot" : ""}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
          {selected && project && client ? (
            <Card>
              <h2 className="font-serif text-2xl">{project.title}</h2>
              <p className="text-sm text-muted">{project.logline}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted">Client</dt><dd><Link href={`/actors/${client.personId}`} className="hover:text-teal">{client.name}</Link></dd></div>
                <div><dt className="text-muted">Role</dt><dd>{selected.role} · {selected.character}</dd></div>
                <div><dt className="text-muted">Director</dt><dd>{project.directorName}</dd></div>
                <div><dt className="text-muted">Genre</dt><dd>{project.genres.join(" / ")}</dd></div>
                <div><dt className="text-muted">Budget</dt><dd><Explain tip={`${project.budgetTier} package.`}>{money(project.budget)}</Explain></dd></div>
                <div><dt className="text-muted">Studio</dt><dd>{project.studio}</dd></div>
                <div><dt className="text-muted">Shoot</dt><dd>{formatDate(project.shootStart)} · {project.shootWeeks} weeks</dd></div>
                <div><dt className="text-muted">Prep</dt><dd>{formatDate(project.prepStart)}</dd></div>
                <div><dt className="text-muted">Fee</dt><dd><Explain tip={selected.feeWhy}>{selected.pay === "episode" && selected.episodeFee ? `${money(selected.episodeFee)} × ${selected.episodes} eps = ${money(selected.fee)}` : money(selected.fee)}</Explain></dd></div>
                {selected.seasonNumber ? <div><dt className="text-muted">Season</dt><dd>{selected.seasonNumber}{selected.renewal ? " · renewal" : ""}</dd></div> : null}
                {selected.deal ? <div className="col-span-2"><dt className="text-muted">Deal</dt><dd>{selected.deal.style} · {selected.deal.seasons} season{selected.deal.seasons === 1 ? "" : "s"} · {Math.round(selected.deal.annualBump * 100)}% a year</dd></div> : null}
                <div><dt className="text-muted">Billing</dt><dd>{billingLabel(selected.billing)}</dd></div>
                <div><dt className="text-muted">Backend</dt><dd>{backendLabel(selected.backendStyle, selected.backend)}</dd></div>
                {selected.earningsLow != null ? <div className="col-span-2"><dt className="text-muted">Expected earnings</dt><dd>{money(selected.earningsLow)} upfront, up to {money(selected.earningsHigh ?? selected.earningsLow)} if the film hits. Commission is taken when each piece is paid, including backend months later.</dd></div> : null}
                <div><dt className="text-muted">Prestige</dt><dd><Explain tip={selected.prestigeWhy}>{selected.prestige}</Explain></dd></div>
                <div><dt className="text-muted">Risk</dt><dd><Explain tip={selected.riskWhy}>{selected.risk}</Explain></dd></div>
                <div><dt className="text-muted">Expires</dt><dd>{formatDate(selected.expires)}</dd></div>
              </dl>
              <p className="mt-3 text-sm">{selected.scriptNote}</p>
              {selected.willingness ? <p className="mt-2 text-sm text-muted">{selected.willingness}</p> : null}
              {selected.bonuses?.length ? <p className="mt-2 text-sm">Bonuses: {selected.bonuses.map((bonus) => bonus.kind === "awards" ? `awards win ${money(bonus.amount)}` : `${bonus.multiple}x budget ${money(bonus.amount)}`).join(", ")}. Paid through the waterfall, not on signing.</p> : null}
              {selected.blocks?.length ? <p className="mt-2 text-sm">Calendar: {selected.blocks.map((block) => `${formatDate(block.start)} · ${block.weeks} weeks · ${block.episodes} eps`).join("; ")}</p> : null}
              {conflict ? <p className="mt-3 rounded-xl bg-blush px-3 py-2 text-sm">{conflict}</p> : null}
              {params.warn ? (
                <form action={acceptOfferAction} className="mt-3">
                  <input type="hidden" name="offerId" value={selected.id} />
                  <input type="hidden" name="confirm" value="yes" />
                  <button className={buttonClass()}>Confirm anyway</button>
                </form>
              ) : null}
              {selected.status === "pending" ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <form action={acceptOfferAction}>
                      <input type="hidden" name="offerId" value={selected.id} />
                      {params.warn ? <input type="hidden" name="confirm" value="yes" /> : null}
                      <button className={buttonClass()}>Accept</button>
                    </form>
                    <form action={declineOfferAction}>
                      <input type="hidden" name="offerId" value={selected.id} />
                      <button className={buttonClass("danger")}>Decline</button>
                    </form>
                  </div>
                  <form action={counterOfferAction} className="grid gap-2 text-sm sm:grid-cols-2">
                    <input type="hidden" name="offerId" value={selected.id} />
                    {params.warn ? <input type="hidden" name="confirm" value="yes" /> : null}
                    <label>Fee<input name="fee" type="number" min={0} defaultValue={selected.fee} className="mt-1 w-full rounded-xl border border-line px-2 py-1" /></label>
                    <label>Billing (1 is top)<input name="billing" type="number" min={1} max={8} defaultValue={selected.billing} className="mt-1 w-full rounded-xl border border-line px-2 py-1" /></label>
                    <label>Backend points<input name="backend" type="number" min={0} max={10} step="0.5" defaultValue={selected.backend} className="mt-1 w-full rounded-xl border border-line px-2 py-1" /></label>
                    <label>Date shift (weeks){selected.dateFlexible ? "" : " · not flexible"}<input name="dateShift" type="number" min={-4} max={4} defaultValue={0} disabled={!selected.dateFlexible} className="mt-1 w-full rounded-xl border border-line px-2 py-1" /></label>
                    {selected.perkAvailable ? (
                      <label className="sm:col-span-2">Perk
                        <select name="perk" className="mt-1 w-full rounded-xl border border-line px-2 py-1" defaultValue="">
                          <option value="">None</option>
                          <option>Producer credit</option>
                          <option>Trailer billing</option>
                          <option>First-look</option>
                        </select>
                      </label>
                    ) : null}
                    <button className={buttonClass("secondary")}>Send counter</button>
                  </form>
                  <p className="text-xs text-muted">Studio walk-away is hidden. Heat with {selected.studio}: {client.studioHeat?.[selected.studio] ?? 0}.</p>
                </div>
              ) : <p className="mt-4 text-sm">This offer is {selected.status.replaceAll("_", " ")}. Nothing left to sign on it.</p>}
            </Card>
          ) : null}
        </div>
      )}
    </main>
  );
}
