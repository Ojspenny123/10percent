import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { abandonAction, castAction, conceptAction, directorAction, distributeAction, financeAction, marketingAction } from "@/lib/actions";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { formatDate, marketFee, previewCost, tierLabel } from "@/engine";
import { loadCatalog } from "@/lib/catalog";
import { money } from "@/lib/format";
import { readSlot } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function ProductionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const active = await readSlot();
  if (!active) redirect("/");
  const production = active.state.productions?.find((row) => row.id === id);
  if (!production) notFound();
  const project = production.projectId ? active.state.projects.find((row) => row.id === production.projectId) : undefined;
  const catalog = await loadCatalog();
  const concept = production.conceptIndex == null ? undefined : production.concepts[production.conceptIndex];
  const cost = previewCost(production);
  const clients = active.state.clients.filter((client) => client.agency === "player" && client.contract);
  const outsiders = catalog.actors.filter((actor) => !active.state.clients.some((client) => client.personId === actor.id && client.agency === "player")).slice(0, 24);
  const directors = [...catalog.directors].sort((a, b) => b.popularity - a.popularity).slice(0, 24);
  return (
    <main>
      <PageHeader title={concept?.title ?? "Development"} lede={`${production.genre} · ${tierLabel(production.tier)} · ${production.stage}. ${concept?.logline ?? "Pick a concept to lock the title."}`} />
      {query.notice ? <p className="mb-3 rounded-2xl bg-teal-soft px-3 py-2 text-sm">{query.notice}</p> : null}
      {query.error ? <p className="mb-3 rounded-2xl bg-blush px-3 py-2 text-sm">{query.error}</p> : null}
      {production.stage === "development" ? (
        <div className="space-y-3">
          {production.concepts.map((option, index) => (
            <Card key={option.title}>
              <h2 className="font-serif text-2xl">{option.title}</h2>
              <p className="mt-1 text-sm">{option.logline}</p>
              <p className="mt-2 text-sm text-muted">Script reads {option.scriptQuality}. The hook stays in the file until a screening.</p>
              <form action={conceptAction} className="mt-3">
                <input type="hidden" name="id" value={production.id} />
                <input type="hidden" name="index" value={index} />
                <button className={buttonClass()}>Develop this</button>
              </form>
            </Card>
          ))}
          <form action={abandonAction}><input type="hidden" name="id" value={production.id} /><button className={buttonClass("secondary")}>Shelve it</button></form>
        </div>
      ) : null}
      {production.stage === "packaging" || production.stage === "financed" || production.stage === "released" ? (
        <div className="space-y-4">
          <Card>
            <h2 className="font-serif text-xl">Package</h2>
            <p className="mt-2 text-sm">Director {production.directorName || "not attached"}{production.directorFee ? ` · ${money(production.directorFee)}` : ""}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {production.cast.map((member) => (
                <li key={member.personId}>{member.name} · {member.role} · {money(member.fee)}{member.isPlayerClient ? " · your client" : ""}</li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-muted">Cast</dt><dd>{money(cost.cast)}</dd></div>
              <div><dt className="text-muted">Director</dt><dd>{money(cost.director)}</dd></div>
              <div><dt className="text-muted">Crew</dt><dd>{money(cost.crew)}</dd></div>
              <div><dt className="text-muted">Production</dt><dd>{money(cost.production)}</dd></div>
              <div><dt className="text-muted">Marketing</dt><dd>{money(cost.marketing)}</dd></div>
              <div><dt className="text-muted">Contingency</dt><dd>{money(cost.contingency)}</dd></div>
              <div className="col-span-2"><dt className="text-muted">All-in</dt><dd className="font-medium">{money(cost.total)}{cost.inflated ? " · cast pushed the tier up" : ""}</dd></div>
            </dl>
            {project ? <p className="mt-3 text-sm"><Link href={`/projects/${project.id}`} className="text-teal hover:underline">Slate file</Link> · shoots {formatDate(project.shootStart)} · opens {formatDate(project.release)}</p> : null}
          </Card>
          {production.stage === "packaging" ? (
            <>
              <Card>
                <h2 className="font-serif text-xl">Director</h2>
                <form action={directorAction} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={production.id} />
                  <select name="directorId" className="rounded-xl border border-line px-3 py-2 text-sm">
                    {directors.map((director) => <option key={director.id} value={director.id}>{director.name}</option>)}
                  </select>
                  <button className={buttonClass()}>Attach</button>
                </form>
              </Card>
              <Card>
                <h2 className="font-serif text-xl">Cast</h2>
                <p className="mt-2 text-sm text-muted">Your clients follow normal availability. Paying under 75% of market costs loyalty. Paying well above market raises it. Unsigned and rival actors will not go below 90% of market.</p>
                <div className="mt-4 space-y-3">
                  {clients.map((client) => {
                    const market = marketFee(client, "Lead", production.tier, production.genre);
                    return (
                      <form key={client.personId} action={castAction} className="flex flex-wrap items-end gap-2 text-sm">
                        <input type="hidden" name="id" value={production.id} />
                        <input type="hidden" name="personId" value={client.personId} />
                        <p className="min-w-40 font-medium">{client.name}<span className="block text-xs text-muted">Client · market {money(market)} · loyalty {client.loyalty}</span></p>
                        <label>Role
                          <select name="role" className="mt-1 block rounded-xl border border-line px-2 py-1">
                            <option>Lead</option>
                            <option>Co-lead</option>
                            <option>Supporting</option>
                          </select>
                        </label>
                        <label>Fee
                          <input name="fee" type="number" min={5000} step={1000} defaultValue={market} className="mt-1 block w-36 rounded-xl border border-line px-2 py-1" />
                        </label>
                        <button className={buttonClass("secondary")}>Offer</button>
                      </form>
                    );
                  })}
                  <form action={castAction} className="flex flex-wrap items-end gap-2 text-sm">
                    <input type="hidden" name="id" value={production.id} />
                    <label>Outside actor
                      <select name="personId" className="mt-1 block rounded-xl border border-line px-2 py-1">
                        {outsiders.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
                      </select>
                    </label>
                    <label>Role
                      <select name="role" className="mt-1 block rounded-xl border border-line px-2 py-1">
                        <option>Lead</option>
                        <option>Supporting</option>
                      </select>
                    </label>
                    <label>Fee
                      <input name="fee" type="number" min={5000} step={1000} defaultValue={50000} className="mt-1 block w-36 rounded-xl border border-line px-2 py-1" />
                    </label>
                    <button className={buttonClass("secondary")}>Offer market or above</button>
                  </form>
                </div>
              </Card>
              <Card>
                <h2 className="font-serif text-xl">Finance</h2>
                <p className="mt-2 text-sm text-muted">Cash pays the whole negative cost. A loan covers 65% at 9%. Investors cover 60% and take half the profit. A studio pre-sale covers 70%, takes 40% of profit, and raises the distributor fee. Marketing is cash on top. Rent for the shoot has to stay covered.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["cash", "loan", "investors", "studio"] as const).map((plan) => (
                    <form key={plan} action={financeAction}>
                      <input type="hidden" name="id" value={production.id} />
                      <input type="hidden" name="plan" value={plan} />
                      <button className={buttonClass(plan === "cash" ? "primary" : "secondary")}>{plan}</button>
                    </form>
                  ))}
                </div>
              </Card>
            </>
          ) : null}
          {production.stage === "financed" && project && !project.ended ? (
            <Card>
              <h2 className="font-serif text-xl">Distribute</h2>
              <p className="mt-2 text-sm">Sale price about {money(production.salePrice)}, upside capped. Theatrical keeps the gross and pays a {Math.round(production.distributorFee * 100)}% distributor fee. Current plan: {production.distribution}.</p>
              {production.events.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {production.events.map((event, index) => <li key={index}>{formatDate(event.date)} · {event.title}. {event.body}</li>)}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">No production events yet. Delays, overruns, injuries, and test screenings show up during the shoot.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={distributeAction}><input type="hidden" name="id" value={production.id} /><input type="hidden" name="mode" value="sale" /><button className={buttonClass("secondary")}>Sell it</button></form>
                <form action={distributeAction}><input type="hidden" name="id" value={production.id} /><input type="hidden" name="mode" value="theatrical" /><button className={buttonClass()}>Release theatrically</button></form>
              </div>
              <form action={marketingAction} className="mt-4 flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="id" value={production.id} />
                <label>Marketing spend
                  <input name="amount" type="number" min={0} step={1000} defaultValue={production.marketing} className="mt-1 block w-40 rounded-xl border border-line px-2 py-1" />
                </label>
                <button className={buttonClass("secondary")}>Set marketing</button>
              </form>
            </Card>
          ) : null}
          {production.waterfall ? (
            <Card>
              <h2 className="font-serif text-xl">Waterfall{production.sleeper ? " · sleeper hit" : ""}</h2>
              {production.hookRevealed && concept ? <p className="mt-2 text-sm text-muted">Hook {concept.hook}. Script {concept.scriptQuality}.</p> : null}
              <ul className="mt-3 space-y-2 text-sm">
                {production.waterfall.lines.map((line) => (
                  <li key={line.label} className="flex flex-wrap justify-between gap-3 border-b border-line pb-2">
                    <span>{line.label}<span className="mt-1 block text-xs text-muted">{line.note}</span></span>
                    <span>{money(line.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
      {production.stage === "abandoned" ? <p className="text-sm text-muted">Shelved. The development fee is gone.</p> : null}
    </main>
  );
}
