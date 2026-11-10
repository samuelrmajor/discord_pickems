"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { dayLabel, timeShort } from "@/lib/format";
import type { TdGameVM, TdLegVM } from "@/lib/td/data";
import { formatAmericanLong, parlayState, quoteParlay, type LegResult } from "@/lib/td/odds";
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
          const mine = leg.user === user;
          return (
            <li
              key={leg.user}
              className={`flex min-h-0 items-center gap-2 overflow-hidden rounded-lg border bg-[var(--panel)] px-2 ${
                leg.result === "hit"
                  ? "border-[var(--accent)]/50"
                  : leg.result === "miss"
                    ? "border-[var(--loss)]/40 opacity-75"
                    : "border-[var(--line)]"
              }`}
            >
              <Headshot athleteId={leg.athleteId} logo={logoOf(leg.team)} size={28} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="flex items-baseline gap-1.5 text-[13px]">
                  <span
                    className={`truncate font-semibold ${
                      leg.result === "miss" ? "line-through decoration-[var(--loss)]/60" : ""
                    }`}
                  >
                    {leg.name}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-semibold ${
                      mine ? "text-[var(--accent)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {display(leg.user)}
                  </span>
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
              <ResultPill result={leg.result} tds={leg.tds} />
            </li>
          );
        })}

        {missing.map((member) => (
          <li
            key={member}
            className="flex min-h-0 items-center gap-2 overflow-hidden rounded-lg border border-dashed border-[var(--line)] px-2"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--panel-2)]
                         text-[12px] font-bold text-[var(--muted)]"
            >
              {display(member).charAt(0)}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13px] leading-tight">
              <span className={`font-semibold ${member === user ? "text-[var(--accent)]" : ""}`}>
                {display(member)}
              </span>
              <span className="pl-1.5 text-[10px] text-[var(--muted)]">
                {picksOpen ? "hasn't made a selection yet" : "no selection this week"}
              </span>
            </p>
          </li>
        ))}
      </ol>
    </div>
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

  // Live and not-yet-kicked-off legs are both still pending; the bar keeps them apart.
  const waiting = tally.live + tally.pending;
  const parts = [
    tally.hit && `${tally.hit} hit`,
    tally.miss && `${tally.miss} failed`,
    waiting && `${waiting} pending`,
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
