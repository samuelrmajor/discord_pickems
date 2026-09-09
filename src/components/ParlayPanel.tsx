"use client";

import { useMemo, useState } from "react";
import type { LegVM } from "@/lib/view";

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
      [
        `Week ${week} consensus parlay (${legs.length} legs)`,
        ...legs.map((l) => {
          const line = l.isFavorite && l.spread !== null ? ` (-${l.spread})` : "";
          const flip = l.decidedByCoinFlip ? " [coin flip]" : "";
          return `${l.sideAbbr}${line} ML - ${l.shortName}${flip}`;
        }),
      ].join("\n"),
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
      <p className="px-4 py-10 text-center text-xs text-[var(--muted)]">
        No games for week {week} yet.
      </p>
    );
  }

  const cashed = stats.pending === 0 && stats.losses === 0;

  return (
    <div className="px-2 pb-8 pt-2">
      <div className="flex items-center gap-2 rounded-lg bg-[var(--panel)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{legs.length}-leg parlay</p>
          <p className="text-[10px] leading-tight text-[var(--muted)]">
            {stats.pending === 0 ? (
              cashed ? (
                <span className="font-semibold text-[var(--accent)]">Cashed — all legs hit.</span>
              ) : (
                <>
                  {stats.wins} hit, <span className="text-[var(--loss)]">{stats.losses} missed</span>
                </>
              )
            ) : (
              <>
                {stats.wins} hit &middot; {stats.losses} missed &middot; {stats.pending} pending
              </>
            )}
            {stats.flips > 0 && ` · ${stats.flips} on a flip`}
          </p>
        </div>
        <button
          onClick={copy}
          className="h-8 shrink-0 rounded-lg bg-[var(--panel-2)] px-3 text-[11px] font-semibold active:scale-[0.97]"
        >
          {copied ? "Copied" : "Copy legs"}
        </button>
      </div>

      {stats.unvoted > 0 && (
        <p className="px-1 pt-1.5 text-[10px] text-[var(--warn)]">
          {stats.unvoted} game{stats.unvoted === 1 ? " has" : "s have"} no votes yet, so
          {stats.unvoted === 1 ? " that leg is" : " those legs are"} still just the coin flip.
        </p>
      )}

      <ol className="pt-1">
        {legs.map((leg, i) => (
          <li
            key={leg.gameId}
            className="flex items-center gap-2 border-b border-[var(--line)] py-1.5 last:border-b-0"
          >
            <span className="w-4 shrink-0 text-center text-[10px] font-bold tabular-nums text-[var(--muted)]">
              {i + 1}
            </span>

            <span className="shrink-0 text-[13px] font-bold leading-none">{leg.sideAbbr}</span>
            {leg.isFavorite && leg.spread !== null && (
              <span className="shrink-0 text-[10px] leading-none text-[var(--muted)]">
                -{leg.spread}
              </span>
            )}
            {leg.decidedByCoinFlip && (
              <span
                title="The group split evenly, so this game's pre-drawn coin flip decided the leg"
                className="shrink-0 rounded bg-[var(--panel-2)] px-1 text-[9px] font-semibold uppercase text-[var(--warn)]"
              >
                flip
              </span>
            )}

            <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--muted)]">
              {leg.shortName}
            </span>

            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-[var(--muted)]">
              {leg.totalVotes === 0
                ? "—"
                : `${Math.max(leg.homeVotes, leg.awayVotes)}/${leg.totalVotes}`}
            </span>
            <span
              className={`w-10 shrink-0 text-right text-[10px] font-semibold ${
                leg.result === "win"
                  ? "text-[var(--accent)]"
                  : leg.result === "loss"
                    ? "text-[var(--loss)]"
                    : "text-[var(--muted)]"
              }`}
            >
              {leg.result === "win"
                ? "hit"
                : leg.result === "loss"
                  ? "missed"
                  : leg.result === "push"
                    ? "push"
                    : "pending"}
            </span>
          </li>
        ))}
      </ol>

      <p className="px-1 pt-3 text-[10px] leading-relaxed text-[var(--muted)]">
        Each leg is the majority pick of the {memberCount} of us. A dead-even split falls to that
        game&apos;s coin flip, drawn before anyone voted and shown on the picks screen.
      </p>
    </div>
  );
}
