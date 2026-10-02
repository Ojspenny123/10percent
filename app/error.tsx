"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-serif text-4xl">Something in the office broke</h1>
      <p className="mt-3 text-muted">{error.message || "The page failed to render."}</p>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-coral px-4 py-2 text-sm font-medium text-white">
        Try again
      </button>
    </main>
  );
}
