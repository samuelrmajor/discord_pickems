"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { dayLabel, timeShort } from "@/lib/format";
import type { TdGameVM, TdLegVM } from "@/lib/td/data";
import {
  formatAmerican,
  formatAmericanLong,
  parlayState,
  quoteParlay,
  type LegResult,
} from "@/lib/td/odds";
import { Headshot, ResultPill, TeamLogo, display } from "./bits";

type Props = {
  user: string;
  members: string[];
  legs: TdLegVM[];
  games: TdGameVM[];
  /** Each leg's price, in `legs` order, with any prices fetched this session layered on. */
  legPrices: (number | null)[];
  stake: number;
  /** Whether any game is still open to pick in, so a missing pick still has time. */
  picksOpen: boolean;
  logoOf: (team: string) => string | null;
};

/** How often to pull fresh box scores while a leg's game is on. Matches the server's TTL. */
const LIVE_REFRESH_MS = 60 * 1000;

/**
 * Legs read top-down in the order they matter during a Sunday: what is
 * happening now, then what is still to come, then what's already decided.
 */
const ORDER: Record<LegResult, number> = { live: 0, pending: 1, hit: 2, miss: 3, void: 4 };

export default function TdParlay({
  user,
  members,
  legs,
  games,
  legPrices,
  stake,
  picksOpen,
  logoOf,
}: Props) {
  const router = useRouter();
  const gameById = new Map(games.map((g) => [g.id, g]));
  const anyLive = legs.some((l) => gameById.get(l.gameId)?.status === "in_progress");

  // Keep the board moving during games without anyone pulling to refresh. Only
  // while a leg is live, and only while the tab is actually being looked at.
  useEffect(() => {
    if (!anyLive) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [anyLive, router]);

  const status = parlayState(legs.map((l) => l.result));
  // A void leg comes off the ticket, so it comes off the price too.
  const quote = quoteParlay(
    legPrices.filter((_, i) => legs[i].result !== "void"),
    stake
  );

  const sorted = [...legs].sort(
    (a, b) =>
      ORDER[a.result] - ORDER[b.result] ||
      a.kickoffAt.localeCompare(b.kickoffAt) ||
      a.name.localeCompare(b.name)
  );

  // `legPrices` is in `legs` order; the rows are re-sorted, so key it by player.
  const priceOf = new Map(legs.map((l, i) => [l.athleteId, legPrices[i] ?? null]));

  // Everyone gets a row, so a missing pick is as plain as a busted one.
  const missing = members.filter((m) => !legs.some((l) => l.user === m));

  const rows = sorted.length + missing.length;

  return (
    <div className="flex h-full flex-col gap-1.5 px-2 pb-2 pt-1.5">
      {legs.length > 0 && (
        <StatusCard
          state={status.state}
          tally={status}
          legCount={legs.length}
          american={quote.priced ? quote.american : null}
          payout={quote.priced ? quote.payout : null}
          stake={stake}
          live={anyLive}
        />
      )}

      {/*
        Every member on one screen, no scrolling: the rows split whatever height
        is left, up to a comfortable 52px each on a tall phone, and shrink to
        fit a short one.
      */}
      <ol
        className="grid min-h-0 flex-1 content-start gap-1"
        style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 52px))` }}
      >
        {sorted.map((leg) => {
          const game = gameById.get(leg.gameId) ?? null;
          const price = priceOf.get(leg.athleteId) ?? null;
          return (
            <li
              key={leg.user}
              className={`${ROW} border bg-[var(--panel)] ${
                leg.result === "hit"
                  ? "border-[var(--accent)]/50"
                  : leg.result === "miss"
                    ? "border-[var(--loss)]/40 opacity-75"
                    : "border-[var(--line)]"
              }`}
            >
              <UserCell name={leg.user} mine={leg.user === user} />

              <div className="flex min-w-0 items-center gap-1.5">
                <Headshot athleteId={leg.athleteId} logo={logoOf(leg.team)} size={28} />
                <div className="min-w-0 leading-tight">
                  <p
                    className={`truncate text-[13px] font-semibold ${
                      leg.result === "miss" ? "line-through decoration-[var(--loss)]/60" : ""
                    }`}
                  >
                    {leg.name}
                  </p>
                  <p className="truncate text-[10px] text-[var(--muted)]">
                    <TeamLogo logo={logoOf(leg.team)} size={10} /> {leg.team} {leg.pos}
                    {game && (
                      <>
                        <span className="px-1">·</span>
                        <GameLine game={game} team={leg.team} />
                      </>
                    )}
                  </p>
                </div>
              </div>

              <span className="text-right text-[12px] font-bold tabular-nums">
                {price === null ? (
                  <span className="font-normal text-[var(--muted)]">—</span>
                ) : (
                  formatAmerican(price)
                )}
              </span>

              <span className="flex justify-end">
                <ResultPill result={leg.result} tds={leg.tds} />
              </span>
            </li>
          );
        })}

        {missing.map((member) => (
          <li key={member} className={`${ROW} border border-dashed border-[var(--line)]`}>
            <UserCell name={member} mine={member === user} />
            <p className="col-span-3 truncate text-[11px] text-[var(--muted)]">
              {picksOpen ? "hasn't made a selection yet" : "no selection this week"}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One row of the board: User | Player (pic, name, team, pos, matchup, time) |
 * Odds | Status. The outer columns are fixed so every row lines up; the player
 * column takes what's left and truncates.
 */
const ROW =
  "grid min-h-0 grid-cols-[3.25rem_minmax(0,1fr)_2.75rem_auto] items-center gap-2 " +
  "overflow-hidden rounded-lg px-2";

function UserCell({ name, mine }: { name: string; mine: boolean }) {
  return (
    <span
      className={`truncate text-[12px] font-semibold ${
        mine ? "text-[var(--accent)]" : "text-[var(--text)]"
      }`}
    >
      {display(name)}
    </span>
  );
}

/** "MIN 17 – BUF 14 · Q3 4:12", or the kickoff before it starts. Player's side first. */
function GameLine({ game, team }: { game: TdGameVM; team: string }) {
  if (game.status === "scheduled") {
    const at = new Date(game.kickoffAt);
    return (
      <span>
        {game.shortName} · {dayLabel(at).split(",")[0]} {timeShort(at)}
      </span>
    );
  }
  const home = game.homeAbbr === team;
  const us = { abbr: team, score: home ? game.homeScore : game.awayScore };
  const them = home
    ? { abbr: game.awayAbbr, score: game.awayScore }
    : { abbr: game.homeAbbr, score: game.homeScore };
  return (
    <span className="tabular-nums">
      <span className="text-[var(--text)]">
        {us.abbr} {us.score ?? 0}
      </span>{" "}
      – {them.abbr} {them.score ?? 0}
      <span className={`pl-1 ${game.status === "in_progress" ? "text-[var(--warn)]" : ""}`}>
        · {game.statusDetail}
      </span>
    </span>
  );
}

function StatusCard({
  state,
  tally,
  legCount,
  american,
  payout,
  stake,
  live,
}: {
  state: ReturnType<typeof parlayState>["state"];
  tally: { hit: number; miss: number; live: number; pending: number; void: number };
  legCount: number;
  american: number | null;
  payout: number | null;
  stake: number;
  /** A leg's game is on, so the board is refreshing itself. */
  live: boolean;
}) {
  const headline = {
    open: { text: `${legCount}-leg parlay`, cls: "text-[var(--text)]" },
    alive: { text: "Still alive", cls: "text-[var(--accent)]" },
    busted: { text: "Busted", cls: "text-[var(--loss)]" },
    cashed: { text: "Cashed", cls: "text-[var(--accent)]" },
  }[state];

  const parts = [
    tally.hit && `${tally.hit} hit`,
    tally.miss && `${tally.miss} failed`,
    tally.live && `${tally.live} live`,
    tally.pending && `${tally.pending} upcoming`,
    tally.void && `${tally.void} void`,
    live && "live, updates every minute",
  ].filter(Boolean);

  return (
    <section className="shrink-0 rounded-lg bg-[var(--panel)] px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-[15px] font-bold leading-tight ${headline.cls}`}>{headline.text}</p>
        {american !== null && (
          <p className="text-[13px] font-bold tabular-nums">{formatAmericanLong(american)}</p>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[10px] leading-tight text-[var(--muted)]">
        <span className="truncate">{parts.join(" · ")}</span>
        {payout !== null && state !== "busted" && (
          <span className="shrink-0">
            ${stake} {state === "cashed" ? "paid" : "pays"}{" "}
            <span className="font-semibold text-[var(--text)]">
              ${payout.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </span>
        )}
      </div>
      {/* One bar segment per leg, so the whole ticket reads at a glance. */}
      <div className="mt-1 flex gap-0.5">
        {(["hit", "live", "pending", "void", "miss"] as const).flatMap((r) =>
          Array.from({ length: tally[r] }, (_, i) => (
            <span
              key={`${r}-${i}`}
              className={`h-1 flex-1 rounded-full ${
                r === "hit"
                  ? "bg-[var(--accent)]"
                  : r === "miss"
                    ? "bg-[var(--loss)]"
                    : r === "live"
                      ? "bg-[var(--warn)]"
                      : "bg-[var(--panel-2)]"
              }`}
            />
          ))
        )}
      </div>
    </section>
  );
}
