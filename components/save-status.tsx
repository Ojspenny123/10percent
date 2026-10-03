"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { advanceAction, saveAsAction, saveNowAction } from "@/lib/actions";
import { buttonClass } from "@/components/ui";

export function SaveStatus({ lastSaved, version }: { lastSaved: string; version: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const saveError = params.get("saveError") || "";
  const saveKind = params.get("saveKind") || "";

  useEffect(() => {
    (window as Window & { __TEN_VERSION?: string }).__TEN_VERSION = String(version);
  }, [version]);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">Last saved: {lastSaved}</p>
      <details className="relative">
        <summary className={`${buttonClass("secondary")} cursor-pointer list-none`}>Game</summary>
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-line bg-white p-3 shadow-card">
          <form action={saveNowAction}>
            <input type="hidden" name="back" value={pathname} />
            <button className={`${buttonClass("secondary")} w-full`}>Save now</button>
          </form>
          <form action={saveAsAction} className="mt-2">
            <button className={`${buttonClass("secondary")} w-full`}>Save as new slot</button>
          </form>
          <a href="/game" className={`${buttonClass("secondary")} mt-2 w-full`}>Load game</a>
        </div>
      </details>
      {saveError ? (
        <div className="w-full rounded-2xl bg-blush px-3 py-2 text-sm text-coral-dark" role="alert">
          <p>{saveError}</p>
          {saveKind === "conflict" ? (
            <a href={pathname} className={`${buttonClass()} mt-2`}>Retry</a>
          ) : (
            <form action={advanceAction} className="mt-2">
              <input type="hidden" name="mode" value="week" />
              <button className={buttonClass()}>Retry</button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
