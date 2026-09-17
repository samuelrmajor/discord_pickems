"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { submitBallot } from "@/app/fantasy/actions";
import type { ConsensusRow } from "@/lib/fantasy/rankings";
import type { Profile } from "@/lib/fantasy/snapshot";
import { formatET } from "@/lib/fantasy/time";
import type { WeekPhase } from "@/lib/fantasy/week";
import ProfileSheet from "./ProfileSheet";
import RankBoard from "./RankBoard";
import ResultsBoard from "./ResultsBoard";

export type Submission = { name: string; started: boolean; lockedIn: boolean };

type Props = {
  user: string;
  season: number;
  leagueName: string;
  week: number;
  currentWeek: number;
  phase: WeekPhase;
  opensAt: string;
  locksAt: string;
  profiles: Profile[];
  myOrder: string[];
  myLockedIn: boolean;
  carriedFromWeek: number | null;
  canVote: boolean;
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
    locksAt,
    profiles,
    myOrder,
    myLockedIn,
    carriedFromWeek,
    canVote,
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
  const [, startTransition] = useTransition();

  const byName = useMemo(() => new Map(profiles.map((p) => [p.name as string, p])), [profiles]);
  const locksLabel = useMemo(() => formatET(new Date(locksAt)), [locksAt]);

  const editable = canVote && phase === "open" && week === currentWeek;
  const submitted = submissions.filter((s) => s.started).length;

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
              <>Locked {locksLabel}</>
            ) : phase === "upcoming" ? (
              <>Opens soon</>
            ) : (
              <>
                Locks <span className="font-semibold text-[var(--warn)]">{locksLabel}</span>
              </>
            )}
          </span>
          <span className="ml-auto flex items-center gap-1" title="Who has submitted">
            {submissions.map((s) => (
              <span
                key={s.name}
                aria-label={`${s.name}: ${s.lockedIn ? "locked in" : s.started ? "in progress" : "not started"}`}
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
              {submitted}/{submissions.length}
            </span>
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 py-1">
        {tab === "rank" ? (
          <RankBoard
            order={order}
            profiles={byName}
            disabled={!editable}
            onReorder={reorder}
            onOpenProfile={setOpenProfile}
          />
        ) : (
          <ResultsBoard
            consensus={consensus}
            profiles={byName}
            ballotCount={ballotCount}
            memberCount={submissions.length}
            locksLabel={locksLabel}
            onOpenProfile={setOpenProfile}
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
              {lockedIn ? "Locked in ✓  (tap to unlock)" : "Lock in my rankings"}
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
      </footer>

      <ProfileSheet
        profile={openProfile ? (byName.get(openProfile) ?? null) : null}
        onClose={() => setOpenProfile(null)}
      />
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
  if (state === "saved") return <>Saved. You can keep editing until it locks.</>;
  if (lockedIn) return <>You can still reorder &mdash; changes save automatically.</>;
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
