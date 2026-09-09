"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import type { GameVM } from "@/lib/view";
import { groupByDay, timeLabel } from "@/lib/format";
import type { Side } from "@/lib/espn";

type Props = {
  season: number;
  week: number;
  games: GameVM[];
  initialPicks: Record<string, Side>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function PicksBoard({ season, week, games, initialPicks }: Props) {
  const [picks, setPicks] = useState<Record<string, Side>>(initialPicks);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [lockedNow, setLockedNow] = useState<Record<string, boolean>>({});
  const [armedBulk, setArmedBulk] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
      }, 1400);
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
          // Kicked off between render and tap: revert and lock the card.
          revert(game.id, previous);
          setLockedNow((prev) => ({ ...prev, [game.id]: true }));
          flash(game.id, "error");
          setNotice(game.shortName + " already kicked off, so that one is locked.");
          return;
        }

        if (!res.ok) throw new Error(String(res.status));
        flash(game.id, "saved");
      } catch {
        revert(game.id, previous);
        flash(game.id, "error");
        setNotice("Could not save that pick. Check your connection and tap again.");
      }
    },
    [flash, isLocked, picks, revert]
  );

  /**
   * First tap fills only the blanks; a second tap on the same button confirms
   * overwriting picks you already made. Stops a fat finger from wiping a card
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

          const targets = overwrite ? openGames : blanks;
          const applied: Record<string, Side> = {};
          for (const game of targets) {
            const side = mode === "favorite" ? game.favorite : mode;
            if (side) applied[game.id] = side;
          }

          setPicks((prev) => ({ ...prev, ...applied }));
          setArmedBulk(null);

          const count = Object.keys(applied).length;
          const missing = targets.length - count;
          setNotice(
            missing > 0
              ? `Set ${count} picks. ${missing} game${missing === 1 ? " has" : "s have"} no line posted yet.`
              : `Set ${count} pick${count === 1 ? "" : "s"}.`
          );
        } catch {
          setNotice("Bulk pick failed. Try again.");
        }
      });
    },
    [armedBulk, openGames, picks, season, week]
  );

  const groups = useMemo(() => groupByDay(games, (g) => new Date(g.kickoffAt)), [games]);

  if (games.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-[var(--muted)]">
        No games scheduled for week {week} yet.
      </p>
    );
  }

  return (
    <div className="pb-32">
      {notice && (
        <button
          onClick={() => setNotice(null)}
          className="mx-3 mt-3 block w-[calc(100%-1.5rem)] rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-left text-xs text-[var(--muted)]"
        >
          {notice} <span className="opacity-60">(tap to dismiss)</span>
        </button>
      )}

      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="sticky top-0 z-10 bg-[var(--bg)]/95 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)] backdrop-blur">
            {group.label}
          </h2>
          <div className="space-y-2 px-3">
            {group.items.map((game) => (
              <GameCard
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2.5">
          <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--muted)]">
            {pickedCount}/{games.length}
          </span>
          <BulkButton
            label="All Home"
            armed={armedBulk === "home"}
            disabled={isPending || openGames.length === 0}
            onClick={() => bulk("home")}
          />
          <BulkButton
            label="All Away"
            armed={armedBulk === "away"}
            disabled={isPending || openGames.length === 0}
            onClick={() => bulk("away")}
          />
          <BulkButton
            label="All Faves"
            armed={armedBulk === "favorite"}
            disabled={isPending || openGames.length === 0 || !hasAnyLine}
            title={hasAnyLine ? undefined : "No betting lines posted for this week yet"}
            onClick={() => bulk("favorite")}
          />
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
      className={`flex-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-35 ${
        armed
          ? "border-[var(--warn)] bg-[var(--warn)] text-black"
          : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--text)]"
      }`}
    >
      {armed ? "Overwrite?" : label}
    </button>
  );
}

function GameCard({
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

  return (
    <div
      className={`rounded-2xl border bg-[var(--panel)] p-2.5 transition ${
        saveState === "error" ? "border-[var(--loss)]" : "border-[var(--line)]"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-[var(--muted)]">
        <span className="tabular-nums">
          {locked ? game.statusDetail || "Locked" : timeLabel(new Date(game.kickoffAt))}
        </span>
        <span className="flex items-center gap-2">
          {saveState === "saving" && <span className="opacity-70">saving...</span>}
          {saveState === "saved" && <span className="text-[var(--accent)]">saved</span>}
          {saveState === "error" && <span className="text-[var(--loss)]">not saved</span>}
          <span title="If the group ties 6-6, this side takes the parlay leg">
            {"\u{1F0CF}"} {game.coinFlipAbbr}
          </span>
          {locked && <span>{"\u{1F512}"}</span>}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
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
      </div>
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
      className={`relative flex min-h-[68px] items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition active:scale-[0.97] disabled:active:scale-100 ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
          : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--text)]"
      } ${locked && !selected ? "opacity-55" : ""} ${
        missed ? "border-[var(--loss)] bg-[var(--loss)] text-white" : ""
      }`}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-tight">{abbr}</span>
        <span className={`block text-[10px] leading-tight ${selected ? "opacity-75" : "text-[var(--muted)]"}`}>
          {side === "home" ? "home" : "away"}
          {isFavorite && game.spread !== null ? ` · -${game.spread}` : ""}
          {votes !== null ? ` · ${votes} pick${votes === 1 ? "" : "s"}` : ""}
        </span>
      </span>
      {score !== null && game.status !== "scheduled" && (
        <span className={`text-lg font-bold tabular-nums ${won ? "" : "opacity-60"}`}>{score}</span>
      )}
    </button>
  );
}
