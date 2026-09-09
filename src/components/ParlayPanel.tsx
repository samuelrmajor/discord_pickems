"use client";

import { useMemo, useState } from "react";
import type { LegVM } from "@/lib/view";
import { timeLabel } from "@/lib/format";

type Props = {
  week: number;
  legs: LegVM[];
  memberCount: number;
};

export default function ParlayPanel({ week, legs, memberCount }: Props) {
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    const wins = legs.filter((l) => l.result === "win").length;
    const losses = legs.filter((l) => l.result === "loss").length;
    const pending = legs.filter((l) => l.result === null).length;
    const flips = legs.filter((l) => l.decidedByCoinFlip).length;
    const unvoted = legs.filter((l) => l.totalVotes === 0).length;
    return { wins, losses, pending, flips, unvoted };
  }, [legs]);

  const asText = useMemo(
    () =>
      [`Week ${week} consensus parlay (${legs.length} legs)`, ...legs.map((l) => {
        const line = l.isFavorite && l.spread !== null ? ` (-${l.spread})` : "";
        const flip = l.decidedByCoinFlip ? " [coin flip]" : "";
        return `${l.sideAbbr}${line} ML - ${l.shortName}${flip}`;
      })].join("\n"),
    [legs, week]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (legs.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-[var(--muted)]">
        No games for week {week} yet.
      </p>
    );
  }

  const cashed = stats.pending === 0 && stats.losses === 0;

  return (
    <div className="px-3 pb-10 pt-3">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">
          Week {week} consensus
        </h2>
        <p className="pt-1 text-2xl font-bold">
          {legs.length}-leg parlay
        </p>
        <p className="pt-1 text-xs text-[var(--muted)]">
          {stats.pending === 0 ? (
            cashed ? (
              <span className="font-semibold text-[var(--accent)]">Cashed. All legs hit.</span>
            ) : (
              <>
                Final: {stats.wins} hit, <span className="text-[var(--loss)]">{stats.losses} missed</span>.
              </>
            )
          ) : (
            <>
              {stats.wins} hit &middot; {stats.losses} missed &middot; {stats.pending} pending
            </>
          )}
          {stats.flips > 0 && ` · ${stats.flips} decided by coin flip`}
        </p>

        {stats.unvoted > 0 && (
          <p className="pt-2 text-xs text-[var(--warn)]">
            {stats.unvoted} game{stats.unvoted === 1 ? " has" : "s have"} no votes yet, so
            {stats.unvoted === 1 ? " that leg is" : " those legs are"} still just the coin flip.
          </p>
        )}

        <button
          onClick={copy}
          className="mt-3 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 text-sm font-semibold active:scale-[0.98]"
        >
          {copied ? "Copied to clipboard" : "Copy legs"}
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {legs.map((leg, i) => (
          <li
            key={leg.gameId}
            className={`rounded-2xl border bg-[var(--panel)] p-3 ${
              leg.result === "win"
                ? "border-[var(--accent)]"
                : leg.result === "loss"
                  ? "border-[var(--loss)]"
                  : "border-[var(--line)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-[var(--muted)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">
                  {leg.sideAbbr}
                  {leg.isFavorite && leg.spread !== null && (
                    <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">-{leg.spread}</span>
                  )}
                </p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  {leg.shortName} &middot; {timeLabel(new Date(leg.kickoffAt))}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums">
                  {leg.totalVotes === 0
                    ? "no votes"
                    : `${Math.max(leg.homeVotes, leg.awayVotes)}/${leg.totalVotes}`}
                </p>
                <p className="text-[10px] text-[var(--muted)]">
                  {leg.decidedByCoinFlip
                    ? "\u{1F0CF} coin flip"
                    : leg.result === "win"
                      ? "hit"
                      : leg.result === "loss"
                        ? "missed"
                        : leg.result === "push"
                          ? "push"
                          : "pending"}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="px-1 pt-4 text-[11px] leading-relaxed text-[var(--muted)]">
        Each leg is the majority pick of the {memberCount} of us. A dead-even split falls to that
        game&apos;s coin flip, drawn before anyone voted and shown on the picks screen.
      </p>
    </div>
  );
}
