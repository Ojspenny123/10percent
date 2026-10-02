"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

type Report = {
  done?: boolean;
  phase?: string;
  actors?: number;
  directors?: number;
  movies?: number;
  message?: string;
  error?: string;
};

export function SeedConsole() {
  const [secret, setSecret] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(method: "GET" | "POST"): Promise<Report> {
    const response = await fetch("/api/admin/seed", {
      method,
      headers: { "x-admin-secret": secret },
    });
    const body = (await response.json()) as Report;
    if (!response.ok && !body.error) body.error = `Request failed (${response.status})`;
    setReport(body);
    return body;
  }

  async function runUntilDone() {
    setBusy(true);
    try {
      for (let i = 0; i < 5000; i++) {
        const body = await call("POST");
        if (body.error || body.done) break;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-white p-6 shadow-card">
      <label className="block text-sm">
        Admin secret
        <input
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
        />
      </label>
      <p className="mt-2 text-sm text-muted">The secret stays in this request. It is not written into the page.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={buttonClass("secondary")} disabled={busy || secret.length < 4} onClick={() => call("GET")}>
          Check status
        </button>
        <button type="button" className={buttonClass()} disabled={busy || secret.length < 4} onClick={() => call("POST")}>
          Run one batch
        </button>
        <button type="button" className={buttonClass("secondary")} disabled={busy || secret.length < 4} onClick={runUntilDone}>
          {busy ? "Seeding…" : "Run until done"}
        </button>
      </div>
      {report ? (
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-paper p-4 text-xs text-ink">
          {JSON.stringify(report, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
