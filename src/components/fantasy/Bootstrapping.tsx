"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Shown while the league snapshot is being built for the first time.
 *
 * The ingest is a server round trip that can take several seconds on a cold
 * cache (Sleeper's active-player dump is ~11MB), so it runs behind this screen
 * instead of blocking the render, and the page re-renders once it lands.
 */
export default function Bootstrapping() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/fantasy/sync", { method: "POST" });
        if (cancelled) return;
        if (!res.ok) throw new Error(String(res.status));
        router.refresh();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-8 text-center">
      {failed ? (
        <>
          <p className="text-[15px] font-semibold">Couldn&apos;t reach Sleeper</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            The league data didn&apos;t load. Give it another go.
          </p>
          <button
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold
                       text-[var(--accent-ink)] active:scale-95"
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--line)]
                       border-t-[var(--accent)]"
          />
          <p className="mt-4 text-[13px] font-semibold">Loading the league</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Pulling rosters, records, and matchups from Sleeper.
          </p>
        </>
      )}
    </div>
  );
}
