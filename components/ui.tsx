import type { ReactNode } from "react";
import type { Mood, WorkStatus } from "@/engine/types";

export function PageHeader({ title, lede, children }: { title: string; lede?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl text-ink sm:text-4xl">{title}</h1>
        {lede ? <p className="mt-2 max-w-2xl text-muted">{lede}</p> : null}
      </div>
      {children}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-card p-5 shadow-card ${className}`}>{children}</section>;
}

export function Explain({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <span className="cursor-help underline decoration-muted/50 decoration-dotted underline-offset-4" title={tip}>
      {children}
      <span className="sr-only"> ({tip})</span>
    </span>
  );
}

export function StatBar({ label, value, tip }: { label: string; value: number; tip: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <Explain tip={tip}>{value}</Explain>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-teal" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
      <div className="h-full rounded-full bg-coral" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

const STATUS_STYLE: Record<WorkStatus, string> = {
  AVAILABLE: "bg-teal-soft text-teal-dark",
  IN_PREP: "bg-gold-soft text-gold",
  SHOOTING: "bg-blush text-coral-dark",
  POST_PRODUCTION: "bg-line text-ink",
  AIRING: "bg-teal-soft text-teal-dark",
};

export function StatusBadge({ status }: { status: WorkStatus }) {
  const label = status === "IN_PREP" ? "In prep" : status === "POST_PRODUCTION" ? "Post-production" : status === "SHOOTING" ? "Shooting" : status === "AIRING" ? "Airing" : "Available";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{label}</span>;
}

const MOOD_STYLE: Record<Mood, string> = {
  Thrilled: "bg-teal",
  Content: "bg-teal/70",
  Uneasy: "bg-gold",
  Unhappy: "bg-coral-soft",
  Furious: "bg-coral-dark",
};

export function MoodDot({ mood }: { mood: Mood }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${MOOD_STYLE[mood]}`} aria-hidden />
      <span>{mood}</span>
    </span>
  );
}

export function Empty({ title, body, href, action }: { title: string; body: string; href?: string; action?: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-white/70 px-6 py-12 text-center">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted">{body}</p>
      {href && action ? (
        <a href={href} className="mt-5 inline-flex rounded-full bg-coral px-4 py-2 text-sm font-medium text-white">
          {action}
        </a>
      ) : null}
    </div>
  );
}

export function FlashBanner({ notice, error, warn }: { notice?: string; error?: string; warn?: string }) {
  if (!notice && !error && !warn) return null;
  const tone = warn ? "border-gold bg-gold-soft text-ink" : error ? "border-coral bg-blush text-ink" : "border-teal bg-teal-soft text-ink";
  return <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${tone}`}>{warn || error || notice}</div>;
}

export function buttonClass(kind: "primary" | "secondary" | "danger" = "primary"): string {
  const base = "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition";
  if (kind === "secondary") return `${base} border border-line bg-white text-ink hover:border-teal`;
  if (kind === "danger") return `${base} border border-coral/40 bg-white text-coral-dark hover:bg-blush`;
  return `${base} bg-coral text-white hover:bg-coral-dark`;
}
