export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-white/80 px-4 py-6 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
        <a href="https://www.themoviedb.org/" className="shrink-0" target="_blank" rel="noreferrer">
          {/* Local copy of the TMDB mark for the required attribution line. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmdb.svg" alt="TMDB" className="h-8 w-auto" />
        </a>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <a href="/data" className="ml-auto text-teal hover:underline">
          Data cache
        </a>
        <a href="/admin" className="text-teal hover:underline">
          Seed
        </a>
      </div>
    </footer>
  );
}
