"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setWeekLock, submitBallot } from "@/app/fantasy/actions";
import type { ConsensusRow } from "@/lib/fantasy/rankings";
import type { ProfileCard, ProfileRosters } from "@/lib/fantasy/profiles";
import { loadRosters, peekRosters } from "@/lib/fantasy/roster-cache";
import { ADMIN_LABEL } from "@/lib/fantasy/admin";
import { formatET } from "@/lib/fantasy/time";
import type { WeekPhase } from "@/lib/fantasy/week";
import ProfileSheet from "./ProfileSheet";
import RankBoard from "./RankBoard";
import ResultsBoard from "./ResultsBoard";
import type { Submission } from "./SubmissionList";

type Props = {
  week: number;
  currentWeek: number;
  phase: WeekPhase;
  opensAt: string;
  /** When Pat closed the week, or null while it is still open. */
  lockedAt: string | null;
  cards: ProfileCard[];
  /** Content hash of the rosters, which are fetched only when a sheet opens. */
  rosterVersion: string;
  myOrder: string[];
  myLockedIn: boolean;
  carriedFromWeek: number | null;
  canVote: boolean;
  /** Pat, who closes the week. Everyone else just sees the state of it. */
  isAdmin: boolean;
  submissions: Submission[];
  consensus: ConsensusRow[] | null;
  ballotCount: number;
  stale: boolean;
};

type Tab = "rank" | "results";
type SaveState = "idle" | "saving" | "saved" | "error";

export default function FantasyShell(props: Props) {
  const {
    week,
    currentWeek,
    phase,
    opensAt,
    lockedAt,
    cards,
    rosterVersion,
    myOrder,
    myLockedIn,
    carriedFromWeek,
    canVote,
    isAdmin,
    submissions,
    consensus,
    ballotCount,
    stale,
  } = props;

  const router = useRouter();
  const [tab, setTab] = useState<Tab>(phase === "locked" ? "results" : "rank");
  const [order, setOrder] = useState(myOrder);
  const [lockedIn, setLockedIn] = useState(myLockedIn);
  const [save, setSave] = useState<SaveState>("idle");
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [, startTransition] = useTransition();

  const byName = useMemo(() => new Map(cards.map((c) => [c.name as string, c])), [cards]);
  const lockedLabel = useMemo(
    () => (lockedAt ? formatET(new Date(lockedAt)) : null),
    [lockedAt]
  );
  const opensLabel = useMemo(() => formatET(new Date(opensAt)), [opensAt]);

  const editable = canVote && phase === "open" && week === currentWeek;
  // Locking in freezes the board. Reordering again means unlocking first, so a
  // "locked in" badge always means the ballot has stopped moving.
  const draggable = editable && !lockedIn;
  const lockedInCount = submissions.filter((s) => s.lockedIn).length;

  /**
   * Navigating between weeks re-renders this component rather than remounting
   * it, so the ballot held in state has to follow the one the server sent.
   * Adjusting during render (rather than in an effect) keeps the two in step
   * without a throwaway pass that paints the previous week's order.
   */
  const [serverBallot, setServerBallot] = useState({ myOrder, myLockedIn });
  if (serverBallot.myOrder !== myOrder || serverBallot.myLockedIn !== myLockedIn) {
    setServerBallot({ myOrder, myLockedIn });
    setOrder(myOrder);
    setLockedIn(myLockedIn);
    setSave("idle");
  }

  /**
   * Refresh league data in the background when the stored snapshot has aged
   * out. The page already rendered from the stale copy, so this only swaps in
   * newer records a moment later rather than holding anything up.
   */
  const refreshed = useRef(false);
  useEffect(() => {
    if (!stale || refreshed.current) return;
    refreshed.current = true;
    fetch("/api/fantasy/sync", { method: "POST" })
      .then((res) => res.ok && router.refresh())
      .catch(() => {});
  }, [stale, router]);

  /**
   * Rosters are the bulk of the league payload and are only ever read inside a
   * profile sheet, so they are fetched the first time one opens and then held
   * in a client-side cache keyed by content version.
   */
  const [rosters, setRosters] = useState<Record<string, ProfileRosters> | null>(() =>
    peekRosters(rosterVersion)
  );
  const [rostersFailed, setRostersFailed] = useState(false);

  const showProfile = (name: string) => {
    setOpenProfile(name);
    if (rosters) return;
    setRostersFailed(false);
    loadRosters(rosterVersion).then((loaded) => {
      if (loaded) setRosters(loaded);
      else setRostersFailed(true);
    });
  };

  const persist = (next: string[], nextLocked: boolean) => {
    setSave("saving");
    startTransition(async () => {
      const result = await submitBallot(week, next, nextLocked);
      setSave(result.ok ? "saved" : "error");
      if (!result.ok) {
        // The server refused (usually the week locked under us) — resync so
        // the UI stops pretending the ballot is still editable.
        router.refresh();
      }
    });
  };

  const reorder = (next: string[]) => {
    setOrder(next);
    persist(next, lockedIn);
  };

  const toggleLock = () => {
    const next = !lockedIn;
    setLockedIn(next);
    persist(order, next);
  };

  /**
   * Pat closing (or reopening) the week for everyone. No optimistic update:
   * this flips what the whole page shows, so it waits for the server and lets
   * the refresh repaint from the truth.
   */
  const toggleWeek = () => {
    setClosing(true);
    startTransition(async () => {
      await setWeekLock(week, phase !== "locked");
      setClosing(false);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-lg flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[var(--line)]">
        <div className="flex items-center justify-between px-2 pt-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href="/"
              aria-label="All modules"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                         bg-[var(--panel)] text-base leading-none active:scale-95"
            >
              &lsaquo;
            </Link>
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Power Rankings
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <WeekArrow to={week - 1} disabled={week <= 1} label="Previous week">
              &lsaquo;
            </WeekArrow>
            <span className="min-w-[68px] text-center text-[13px] font-bold tabular-nums">
              Week {week}
            </span>
            <WeekArrow to={week + 1} disabled={week >= currentWeek} label="Next week">
              &rsaquo;
            </WeekArrow>
          </div>
        </div>

        <div className="flex items-center gap-1 px-2 pb-1.5 pt-1">
          <nav className="flex flex-1 gap-1" role="tablist">
            <Tabs tab={tab} setTab={setTab} />
          </nav>
        </div>

        <div className="flex items-center gap-2 px-3 pb-1.5">
          <span className="text-[10px] text-[var(--muted)]">
            {phase === "locked" ? (
              <>Closed {lockedLabel}</>
            ) : phase === "upcoming" ? (
              <>Opens {opensLabel}</>
            ) : (
              <>
                Open until{" "}
                <span className="font-semibold text-[var(--warn)]">
                  {ADMIN_LABEL} closes it
                </span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => setTab("results")}
            aria-label="See who has voted"
            className="ml-auto flex items-center gap-1 rounded-md px-1 py-0.5 active:bg-[var(--panel)]"
          >
            {submissions.map((s) => (
              <span
                key={s.name}
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  s.lockedIn
                    ? "bg-[var(--accent)]"
                    : s.started
                      ? "bg-[var(--warn)]"
                      : "bg-[var(--line)]"
                }`}
              />
            ))}
            <span className="pl-1 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
              {lockedInCount}/{submissions.length}
            </span>
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 py-1">
        {tab === "rank" ? (
          <RankBoard
            order={order}
            profiles={byName}
            disabled={!draggable}
            onReorder={reorder}
            onOpenProfile={showProfile}
          />
        ) : (
          <ResultsBoard
            consensus={consensus}
            profiles={byName}
            submissions={submissions}
            ballotCount={ballotCount}
            lockedLabel={lockedLabel}
            onOpenProfile={showProfile}
          />
        )}
      </main>

      <footer className="shrink-0 border-t border-[var(--line)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        {tab === "rank" && editable ? (
          <>
            <button
              onClick={toggleLock}
              className={`h-10 w-full rounded-xl text-[14px] font-bold transition active:scale-[0.99] ${
                lockedIn
                  ? "bg-[var(--panel-2)] text-[var(--accent)] ring-1 ring-[var(--accent)]"
                  : "bg-[var(--accent)] text-[var(--accent-ink)]"
              }`}
            >
              {lockedIn ? "Locked in ✓  Tap to edit" : "Lock in my rankings"}
            </button>
            <p className="pt-1 text-center text-[9px] leading-tight text-[var(--muted)]">
              <SaveHint state={save} carriedFromWeek={carriedFromWeek} lockedIn={lockedIn} />
            </p>
          </>
        ) : (
          <p className="py-2 text-center text-[11px] text-[var(--muted)]">
            {!canVote
              ? "You're not in the fantasy league, so you can view but not vote."
              : phase === "locked"
                ? `Week ${week} is final.`
                : week !== currentWeek
                  ? "Only the current week can be edited."
                  : "Voting opens Tuesday at 1:00 AM ET."}
          </p>
        )}

        {isAdmin && phase !== "upcoming" ? (
          <AdminLock
            week={week}
            locked={phase === "locked"}
            busy={closing}
            waitingOn={submissions.length - lockedInCount}
            onToggle={toggleWeek}
          />
        ) : null}
      </footer>

      <ProfileSheet
        profile={openProfile ? (byName.get(openProfile) ?? null) : null}
        rosters={openProfile ? (rosters?.[openProfile] ?? null) : null}
        rostersFailed={rostersFailed}
        onClose={() => setOpenProfile(null)}
      />
    </div>
  );
}

/**
 * Pat's control over the week.
 *
 * Closing is what reveals the board to the league and what stops the Tuesday
 * to Thursday reminders, so the button says how many people it would be
 * closing on rather than just "lock". Reopening stays one tap away, because
 * the only realistic mistake is closing a week too early.
 */
function AdminLock({
  week,
  locked,
  busy,
  waitingOn,
  onToggle,
}: {
  week: number;
  locked: boolean;
  busy: boolean;
  waitingOn: number;
  onToggle: () => void;
}) {
  return (
    <div className="pt-1.5">
      <button
        onClick={onToggle}
        disabled={busy}
        className={`h-9 w-full rounded-xl text-[13px] font-bold transition active:scale-[0.99] disabled:opacity-50 ${
          locked
            ? "bg-[var(--panel)] text-[var(--muted)]"
            : "bg-[var(--warn)] text-[var(--accent-ink)]"
        }`}
      >
        {busy
          ? "Working…"
          : locked
            ? `Reopen week ${week} voting`
            : `Close week ${week} voting`}
      </button>
      <p className="pt-1 text-center text-[9px] leading-tight text-[var(--muted)]">
        {locked
          ? "The board is public. Reopening hides it again."
          : waitingOn > 0
            ? `Still waiting on ${waitingOn}. Closing reveals the board to everyone.`
            : "Everyone is locked in. Closing reveals the board to everyone."}
      </p>
    </div>
  );
}

function SaveHint({
  state,
  carriedFromWeek,
  lockedIn,
}: {
  state: SaveState;
  carriedFromWeek: number | null;
  lockedIn: boolean;
}) {
  if (state === "saving") return <>Saving&hellip;</>;
  if (state === "error") return <span className="text-[var(--loss)]">Couldn&apos;t save</span>;
  if (lockedIn) return <>Your board is frozen. Unlock to make changes.</>;
  if (state === "saved") return <>Saved. Keep editing until you lock in.</>;
  if (carriedFromWeek !== null) return <>Starting from your week {carriedFromWeek} order.</>;
  return <>Drag to reorder. Changes save automatically.</>;
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <>
      {(["rank", "results"] as const).map((key) => (
        <button
          key={key}
          role="tab"
          aria-selected={tab === key}
          onClick={() => setTab(key)}
          className={`h-7 flex-1 rounded-lg text-[12px] font-semibold capitalize transition ${
            tab === key
              ? "bg-[var(--panel-2)] text-[var(--text)]"
              : "text-[var(--muted)] active:bg-[var(--panel)]"
          }`}
        >
          {key}
        </button>
      ))}
    </>
  );
}

function WeekArrow({
  to,
  disabled,
  label,
  children,
}: {
  to: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const cls =
    "flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--panel)] text-base leading-none";
  if (disabled) {
    return (
      <span aria-hidden className={`${cls} opacity-30`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/fantasy?week=${to}`} aria-label={label} className={`${cls} active:scale-95`}>
      {children}
    </Link>
  );
}
