"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-serif text-4xl">Something in the office broke</h1>
      <p className="mt-3 text-muted">
        The page failed to render. This is usually the database being unreachable. Check that DATABASE_URL is set on the
        host and the database is still running.
      </p>
      {error.digest ? (
        <p className="mt-3 text-sm text-muted">
          Error reference: <code>{error.digest}</code> (search for it in the host&apos;s function logs)
        </p>
      ) : null}
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-coral px-4 py-2 text-sm font-medium text-white">
        Try again
      </button>
    </main>
  );
}
