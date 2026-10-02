"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { saveAsAction, saveNowAction } from "@/lib/actions";
import { savedLabel } from "@/lib/save-diff";
import { buttonClass } from "@/components/ui";

export function SaveStatus({ savedAt, version }: { savedAt: string; version: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const saveError = params.get("saveError") || "";
  const saveKind = params.get("saveKind") || "";
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState(() => savedLabel(savedAt, Date.now()));

  useEffect(() => {
    const tick = () => setLabel(savedLabel(savedAt, Date.now()));
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [savedAt]);

  useEffect(() => {
    setSaving(false);
  }, [savedAt, saveError]);

  useEffect(() => {
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!form.querySelector("[name=version]")) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "version";
        input.value = String(version);
        form.appendChild(input);
      }
      setSaving(true);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, [version]);

  const back = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8" aria-live="polite">
      <div>
        {saving ? (
          <p className="text-sm font-medium text-teal-dark">Saving...</p>
        ) : saveError ? (
          <p className="text-sm font-medium text-coral-dark">{saveError}</p>
        ) : (
          <p className="text-sm font-medium text-teal-dark">{label}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {saveError ? (
          saveKind === "conflict" ? (
            <a href={pathname} className={buttonClass()}>Retry</a>
          ) : (
            <form action={saveNowAction}>
              <input type="hidden" name="back" value={pathname} />
              <button className={buttonClass()}>Retry</button>
            </form>
          )
        ) : null}
        <form action={saveNowAction}>
          <input type="hidden" name="back" value={back.startsWith("/game") ? "/game" : pathname} />
          <button className={buttonClass("secondary")}>Save now</button>
        </form>
        <details className="relative">
          <summary className={`${buttonClass("secondary")} cursor-pointer list-none`}>Game</summary>
          <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-line bg-white p-3 shadow-card">
            <form action={saveNowAction}>
              <input type="hidden" name="back" value={pathname} />
              <button className={`${buttonClass("secondary")} w-full`}>Save</button>
            </form>
            <form action={saveAsAction} className="mt-2">
              <button className={`${buttonClass("secondary")} w-full`}>Save as new slot</button>
            </form>
            <a href="/game" className={`${buttonClass("secondary")} mt-2 w-full`}>Load game</a>
          </div>
        </details>
      </div>
    </div>
  );
}
