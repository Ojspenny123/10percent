import Link from "next/link";
import { Suspense } from "react";
import { advanceAction, dismissDecisionAction } from "@/lib/actions";
import { formatDate, money } from "@/lib/format";
import type { GameState } from "@/engine/types";
import { informationalUnread, openDecisions } from "@/engine";
import { buttonClass } from "@/components/ui";
import { SaveStatus } from "@/components/save-status";
import { APP_VERSION } from "@/lib/version";

const NAV = [
  ["Play", [
    ["/dashboard", "Dashboard"],
    ["/game", "Game"],
    ["/roster", "Roster"],
    ["/talent", "Talent"],
    ["/offers", "Offers"],
  ]],
  ["Business", [
    ["/contracts", "Contracts"],
    ["/slate", "Slate"],
    ["/productions", "Productions"],
    ["/finance", "Finance"],
    ["/office", "Office"],
    ["/agents", "Agents"],
    ["/publicists", "Publicists"],
    ["/executives", "Executives"],
    ["/agency", "Agency"],
  ]],
  ["Industry", [
    ["/series", "Series"],
    ["/charts", "Charts"],
    ["/awards", "Awards"],
    ["/news", "News"],
    ["/rivals", "Rivals"],
    ["/talk", "Talk shows"],
    ["/directors", "Directors"],
  ]],
] as const;

export function Shell({ state, version, children }: { state: GameState; version: number; children: React.ReactNode }) {
  const unread = informationalUnread(state);
  const decisions = openDecisions(state);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener("submit",function(event){var form=event.target;if(!form||!form.querySelector)return;var live=window.__TEN_VERSION;var input=form.querySelector("[name=version]");if(!input){input=document.createElement("input");input.type="hidden";input.name="version";form.appendChild(input);}if(live)input.value=String(live);else if(!input.value)input.value=${JSON.stringify(String(version))};window.setTimeout(function(){var buttons=form.querySelectorAll("button");for(var i=0;i<buttons.length;i++){var button=buttons[i];if(button.disabled)continue;button.disabled=true;button.setAttribute("aria-busy","true");if(!button.dataset.label)button.dataset.label=button.textContent;button.textContent="Working…";}},0);},true);`,
        }}
      />
      <aside className="border-b border-line bg-white/80 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="px-4 py-5">
          <Link href="/dashboard" className="font-serif text-2xl text-ink">
            Ten Percent
          </Link>
          <p className="text-xs text-muted">v{APP_VERSION}</p>
          <p className="mt-1 text-sm text-muted">{state.agency.name}</p>
          <p className="text-xs text-muted">{formatDate(state.date)} · {state.era}</p>
          <p className="mt-3 text-sm">
            <span className="text-muted">Cash </span>
            <span className="font-medium" title="Agency cash. Commission lands when a client starts shooting. Rent and salaries leave every four weeks.">
              {money(state.agency.cash)}
            </span>
          </p>
          <p className="text-xs text-muted">{state.agency.tier} · reputation {state.agency.reputation}</p>
          {decisions.length > 0 ? <p className="mt-2 text-xs font-medium text-coral-dark">{decisions.length} {decisions.length === 1 ? "decision" : "decisions"} to make this week</p> : null}
          {unread > 0 ? <p className="mt-2 text-xs font-medium text-coral-dark">{unread} notes unread</p> : null}
        </div>
        <div className="flex gap-2 px-4 pb-4 md:flex-col">
          <form action={advanceAction}><input type="hidden" name="version" value={version} /><input type="hidden" name="mode" value="week" /><button className={buttonClass()} disabled={Boolean(state.gameOver)}>+1 week</button></form>
          <form action={advanceAction}><input type="hidden" name="version" value={version} /><input type="hidden" name="mode" value="month" /><button className={buttonClass("secondary")} disabled={Boolean(state.gameOver)}>+1 month</button></form>
          <form action={advanceAction}><input type="hidden" name="version" value={version} /><input type="hidden" name="mode" value="event" /><button className={buttonClass("secondary")} disabled={Boolean(state.gameOver)}>Until next event</button></form>
        </div>
        <nav className="flex gap-4 overflow-x-auto px-4 pb-4 md:block md:space-y-5">
          {NAV.map(([label, links]) => (
            <div key={label}>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</p>
              <ul className="flex gap-3 md:block md:space-y-1">
                {links.map(([href, text]) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-ink hover:text-teal">
                      {text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 px-4 py-6 sm:px-8">
        <Suspense fallback={<p className="mb-4 text-xs text-muted">Last saved: {formatDate(state.lastAutosave ?? state.date)}</p>}>
          <SaveStatus lastSaved={formatDate(state.lastAutosave ?? state.date)} version={version} />
        </Suspense>
        {decisions.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-gold-soft px-3 py-2 text-sm">
            <p>
              <Link href={decisions[0]!.href} className="font-medium text-ink">{decisions.length} {decisions.length === 1 ? "decision" : "decisions"} to make this week</Link>
              <span className="text-muted"> · {decisions[0]!.title}</span>
            </p>
            <form action={dismissDecisionAction}>
              <input type="hidden" name="id" value={decisions[0]!.id} />
              <input type="hidden" name="back" value={decisions[0]!.href.split("#")[0] || "/dashboard"} />
              <button className={buttonClass("secondary")}>Dismiss (broken item)</button>
            </form>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
