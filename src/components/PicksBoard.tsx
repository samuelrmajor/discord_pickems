"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { GameVM } from "@/lib/view";
import { groupByDay, timeShort } from "@/lib/format";
import type { Side } from "@/lib/espn";

type Props = {
  season: number;
  week: number;
  games: GameVM[];
  initialPicks: Record<string, Side>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * How long after a save we still believe a refresh that disagrees with us is
 * just stale. Past this, a pick the server doesn't have really is missing.
 */
const SETTLE_MS = 4000;

export default function PicksBoard({ season, week, games, initialPicks }: Props) {
  const [picks, setPicks] = useState<Record<string, Side>>(initialPicks);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [lockedNow, setLockedNow] = useState<Record<string, boolean>>({});
  const [armedBulk, setArmedBulk] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  /** Games the server was seen to be missing, so the warning can be specific. */
  const [drifted, setDrifted] = useState<string[]>([]);
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** When each pick made in this session was last written, by game id. */
  const savedAt = useRef<Record<string, number>>({});

  /**
   * The Results and Parlay tabs are server-rendered and swapped in on the
   * client, so they would otherwise still show the vote counts from page load.
   * Pull fresh server data a beat after the last pick lands — debounced so a
   * run of quick taps costs one round trip, not sixteen.
   */
  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 1200);
  }, [router]);

  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  /**
   * Check the board against the server every time fresh props arrive.
   *
   * Saving is optimistic — the tap paints the button and the request goes out
   * behind it — so a dropped request used to leave a pick looking made forever,
   * which is exactly how somebody ends up with one pick stored and a full card
   * on screen. Nothing is overwritten here: a pick the server is missing is
   * reported rather than erased, because the selection on screen is the one the
   * person meant and the "lock in" button can still land it.
   *
   * Only picks made in this session are checked, and only once they have had a
   * moment to settle — a refresh already in flight when a pick was saved comes
   * back without it, and that is staleness, not loss.
   */
  const onScreen = useRef(picks);
  useEffect(() => {
    onScreen.current = picks;
  }, [picks]);

  useEffect(() => {
    const now = Date.now();
    const written = savedAt.current;
    const card = onScreen.current;
    setDrifted(
      Object.keys(written).filter(
        (id) =>
          now - written[id] > SETTLE_MS &&
          card[id] !== undefined &&
          initialPicks[id] !== card[id]
      )
    );
    // Deliberately keyed on the server's picks alone: this must run when fresh
    // truth arrives, not every time the card changes, or a pick saved seconds
    // ago would be judged against a refresh that predates it.
  }, [initialPicks]);

  /**
   * Keep the bottom of the list clear of the action bar.
   *
   * The bar is fixed, so it floats over the last game rather than pushing it up,
   * and the page scrolls the document — there is no inner scroll container to
   * pad. The clearance used to be a hardcoded value, which silently stopped
   * matching the moment the bar grew a second row. Measuring it instead means
   * the last row stays reachable whatever the bar ends up containing.
   */
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const height = bar.getBoundingClientRect().height;
      // Zero means this tab is hidden (`display: none` has no box), not that the
      // bar shrank, so the last real measurement is kept for coming back to.
      if (height > 0) setBarHeight(height);
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const isLocked = useCallback(
    (game: GameVM) => game.locked || lockedNow[game.id] === true,
    [lockedNow]
  );

  const openGames = useMemo(() => games.filter((g) => !isLocked(g)), [games, isLocked]);
  const pickedCount = games.filter((g) => picks[g.id]).length;
  const hasAnyLine = openGames.some((g) => g.favorite !== null);

  const flash = useCallback((gameId: string, state: SaveState) => {
    setSaveStates((prev) => ({ ...prev, [gameId]: state }));
    clearTimeout(savedTimers.current[gameId]);
    if (state === "saved" || state === "error") {
      savedTimers.current[gameId] = setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [gameId]: "idle" }));
      }, 1200);
    }
  }, []);

  const revert = useCallback((gameId: string, previous: Side | undefined) => {
    setPicks((prev) => {
      const next = { ...prev };
      if (previous) next[gameId] = previous;
      else delete next[gameId];
      return next;
    });
  }, []);

  /** Auto-save: the tap *is* the save. There is no submit button anywhere. */
  const choose = useCallback(
    async (game: GameVM, side: Side) => {
      if (isLocked(game)) return;
      const previous = picks[game.id];
      if (previous === side) return;

      setPicks((prev) => ({ ...prev, [game.id]: side }));
      flash(game.id, "saving");

      try {
        const res = await fetch("/api/picks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: game.id, choice: side }),
        });

        if (res.status === 409) {
          // Kicked off between render and tap: revert and lock the row.
          revert(game.id, previous);
          setLockedNow((prev) => ({ ...prev, [game.id]: true }));
          flash(game.id, "error");
          setNotice(game.shortName + " already kicked off, so that one is locked.");
          return;
        }

        if (!res.ok) throw new Error(String(res.status));
        savedAt.current[game.id] = Date.now();
        flash(game.id, "saved");
        scheduleRefresh();
      } catch {
        revert(game.id, previous);
        flash(game.id, "error");
        setNotice("Could not save that pick. Check your connection and tap again.");
      }
    },
    [flash, isLocked, picks, revert, scheduleRefresh]
  );

  /**
   * First tap fills only the blanks; a second tap on the same button confirms
   * overwriting picks you already made. Stops a fat finger from wiping a row
   * somebody actually thought about.
   */
  const bulk = useCallback(
    (mode: "home" | "away" | "favorite") => {
      const overwrite = armedBulk === mode;
      const blanks = openGames.filter((g) => !picks[g.id]);

      if (!overwrite && blanks.length === 0) {
        setArmedBulk(mode);
        setNotice("Every open game is already picked. Tap again to overwrite them all.");
        return;
      }

      startTransition(async () => {
        try {
          const res = await fetch("/api/picks/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ season, week, mode, overwrite }),
          });
          if (!res.ok) throw new Error(String(res.status));

          // The server says which games it actually wrote, and hands back the
          // stored card — a game with no line yet, or one that kicked off a
          // moment ago, is skipped, and guessing at that is how the board and
          // the database used to drift apart.
          const { applied, skipped, saved } = (await res.json()) as {
            applied: number;
            skipped: number;
            saved: Record<string, Side>;
          };

          setPicks(saved);
          savedAt.current = {};
          setDrifted([]);
          setArmedBulk(null);
          scheduleRefresh();

          setNotice(
            skipped > 0
              ? `Set ${applied} pick${applied === 1 ? "" : "s"}. ${skipped} game${skipped === 1 ? " was" : "s were"} left alone.`
              : `Set ${applied} pick${applied === 1 ? "" : "s"}.`
          );
        } catch {
          setNotice("Bulk pick failed. Try again.");
        }
      });
    },
    [armedBulk, openGames, picks, scheduleRefresh, season, week]
  );

  /**
   * Send the whole card and adopt whatever the server says it stored.
   *
   * The one action on this screen that ends with the board and the database
   * provably agreeing: every selection goes up, and the state comes back down
   * from the stored rows rather than from what we hoped happened. It is the fix
   * for a pick that quietly never landed, and it is safe to press at any time.
   */
  const lockIn = useCallback(() => {
    setConfirming(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/picks/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season, week, picks }),
        });
        if (!res.ok) throw new Error(String(res.status));

        const { saved, stored, rejected } = (await res.json()) as {
          saved: Record<string, Side>;
          stored: number;
          rejected: string[];
        };

        setPicks(saved);
        setDrifted([]);
        savedAt.current = {};
        for (const id of rejected) {
          setLockedNow((prev) => ({ ...prev, [id]: true }));
        }

        const open = games.length - rejected.length;
        setNotice(
          stored >= games.length
            ? `All ${stored} picks are locked in.`
            : rejected.length > 0
              ? `${stored} of ${games.length} locked in. ${rejected.length} game${rejected.length === 1 ? "" : "s"} had already kicked off.`
              : `${stored} of ${open} locked in — the rest are still blank.`
        );
        router.refresh();
      } catch {
        setNotice("Couldn't reach the server. Your picks aren't confirmed — try again.");
      } finally {
        setConfirming(false);
      }
    });
  }, [games.length, picks, router, season, week]);

  const groups = useMemo(() => groupByDay(games, (g) => new Date(g.kickoffAt)), [games]);

  if (games.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-xs text-[var(--muted)]">
        No games scheduled for week {week} yet.
      </p>
    );
  }

  return (
    <div>
      {drifted.length > 0 && (
        <div className="mx-2 mt-2 rounded-lg border border-[var(--warn)] bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] leading-snug">
          <span className="font-semibold text-[var(--warn)]">
            {drifted.length} pick{drifted.length === 1 ? "" : "s"} didn&apos;t reach the server.
          </span>{" "}
          <span className="text-[var(--muted)]">
            They&apos;re still on your card — tap Lock in picks to save them.
          </span>
        </div>
      )}

      {notice && (
        <button
          onClick={() => setNotice(null)}
          className="mx-2 mt-2 block w-[calc(100%-1rem)] rounded-lg bg-[var(--panel-2)] px-2.5 py-1.5 text-left text-[11px] leading-snug text-[var(--muted)]"
        >
          {notice}
        </button>
      )}

      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="sticky top-0 z-10 bg-[var(--bg)]/95 px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] backdrop-blur">
            {group.label}
          </h2>
          <div className="px-2">
            {group.items.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                locked={isLocked(game)}
                pick={picks[game.id] ?? null}
                saveState={saveStates[game.id] ?? "idle"}
                onChoose={choose}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Stands in for the fixed bar's footprint so the last game clears it. */}
      <div aria-hidden style={{ height: barHeight || 92 }} />

      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto max-w-lg px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-9 shrink-0 text-center text-[11px] font-semibold tabular-nums text-[var(--muted)]">
              {pickedCount}/{games.length}
            </span>
            <BulkButton
              label="Home"
              armed={armedBulk === "home"}
              disabled={isPending || openGames.length === 0}
              onClick={() => bulk("home")}
            />
            <BulkButton
              label="Away"
              armed={armedBulk === "away"}
              disabled={isPending || openGames.length === 0}
              onClick={() => bulk("away")}
            />
            <BulkButton
              label="Faves"
              armed={armedBulk === "favorite"}
              disabled={isPending || openGames.length === 0 || !hasAnyLine}
              title={hasAnyLine ? undefined : "No betting lines posted for this week yet"}
              onClick={() => bulk("favorite")}
            />
          </div>
          <button
            onClick={lockIn}
            disabled={confirming || pickedCount === 0}
            className={`mt-1.5 h-9 w-full rounded-lg text-[12px] font-bold transition
                        active:scale-[0.99] disabled:opacity-30 ${
                          drifted.length > 0
                            ? "bg-[var(--warn)] text-black"
                            : "bg-[var(--accent)] text-[var(--accent-ink)]"
                        }`}
          >
            {confirming ? "Checking with the server…" : "Lock in picks"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkButton({
  label,
  armed,
  disabled,
  title,
  onClick,
}: {
  label: string;
  armed: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 flex-1 rounded-lg text-[11px] font-semibold transition active:scale-[0.97] disabled:opacity-30 ${
        armed ? "bg-[var(--warn)] text-black" : "bg-[var(--panel-2)] text-[var(--text)]"
      }`}
    >
      {armed ? "Overwrite?" : `All ${label}`}
    </button>
  );
}

function GameRow({
  game,
  locked,
  pick,
  saveState,
  onChoose,
}: {
  game: GameVM;
  locked: boolean;
  pick: Side | null;
  saveState: SaveState;
  onChoose: (game: GameVM, side: Side) => void;
}) {
  const showSplit = locked && game.homeVotes !== null && game.awayVotes !== null;

  // The left column doubles as the save indicator, so reporting that a tap
  // stuck costs no extra space in the row.
  const status =
    saveState === "saving"
      ? { text: "···", cls: "text-[var(--muted)]" }
      : saveState === "saved"
        ? { text: "saved", cls: "text-[var(--accent)]" }
        : saveState === "error"
          ? { text: "retry", cls: "text-[var(--loss)]" }
          : locked
            ? { text: game.status === "final" ? "final" : "live", cls: "text-[var(--muted)]" }
            : { text: timeShort(new Date(game.kickoffAt)), cls: "text-[var(--muted)]" };

  return (
    <div className="flex items-center gap-1.5 border-b border-[var(--line)] py-1 last:border-b-0">
      <span className={`w-10 shrink-0 text-[10px] tabular-nums ${status.cls}`}>{status.text}</span>

      <TeamButton
        game={game}
        side="away"
        selected={pick === "away"}
        locked={locked}
        votes={showSplit ? game.awayVotes : null}
        onChoose={onChoose}
      />
      <TeamButton
        game={game}
        side="home"
        selected={pick === "home"}
        locked={locked}
        votes={showSplit ? game.homeVotes : null}
        onChoose={onChoose}
      />

      <span
        title="If the group splits 6-6, this side takes the parlay leg"
        className="w-7 shrink-0 text-right text-[9px] leading-[1.15] text-[var(--muted)]"
      >
        <span className="block opacity-60">tie</span>
        <span className="block font-semibold">{game.coinFlipAbbr}</span>
      </span>
    </div>
  );
}

function TeamButton({
  game,
  side,
  selected,
  locked,
  votes,
  onChoose,
}: {
  game: GameVM;
  side: Side;
  selected: boolean;
  locked: boolean;
  votes: number | null;
  onChoose: (game: GameVM, side: Side) => void;
}) {
  const abbr = side === "home" ? game.homeAbbr : game.awayAbbr;
  const name = side === "home" ? game.homeName : game.awayName;
  const logo = side === "home" ? game.homeLogo : game.awayLogo;
  const score = side === "home" ? game.homeScore : game.awayScore;
  const isFavorite = game.favorite === side;
  const won = game.winner === side;
  const missed = selected && game.winner !== null && game.winner !== "push" && !won;

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onChoose(game, side)}
      aria-pressed={selected}
      aria-label={`${side === "home" ? "Home" : "Away"}: ${name}`}
      className={`flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 transition active:scale-[0.97] disabled:active:scale-100 ${
        selected
          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
          : "bg-[var(--panel)] text-[var(--text)]"
      } ${locked && !selected ? "opacity-50" : ""} ${missed ? "bg-[var(--loss)] text-white" : ""}`}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" />
      )}
      <span className="truncate text-[13px] font-bold leading-none">{abbr}</span>
      {isFavorite && game.spread !== null && (
        <span
          className={`text-[10px] leading-none ${selected ? "opacity-70" : "text-[var(--muted)]"}`}
        >
          -{game.spread}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-baseline gap-1">
        {votes !== null && (
          <span className={`text-[9px] ${selected ? "opacity-70" : "text-[var(--muted)]"}`}>
            {votes}
          </span>
        )}
        {score !== null && game.status !== "scheduled" && (
          <span className={`text-sm font-bold tabular-nums ${won ? "" : "opacity-60"}`}>
            {score}
          </span>
        )}
      </span>
    </button>
  );
}
