"use client";

import { useState } from "react";
import { initials, tmdbImage } from "@/lib/images";

export function Portrait({
  path,
  name,
  className = "",
}: {
  path: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : tmdbImage(path, "w342");
  if (!src) {
    return (
      <div className={`grid place-items-center bg-blush text-lg font-semibold text-coral-dark ${className}`} aria-hidden>
        {initials(name)}
      </div>
    );
  }
  return (
    // TMDB portraits are remote and need an onError fallback to initials.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`h-full w-full object-cover ${className}`} onError={() => setFailed(true)} />
  );
}
