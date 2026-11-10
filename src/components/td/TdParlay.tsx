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

  return (
    <div className="px-2 pb-8 pt-2">
      {legs.length > 0 && (
        <StatusCard
          state={status.state}
          tally={status}
          legCount={legs.length}
          american={quote.priced ? quote.american : null}
          payout={quote.priced ? quote.payout : null}
          stake={stake}
        />
      )}

      <ol className="mt-2 grid gap-1.5">
        {sorted.map((leg) => {
          const game = gameById.get(leg.gameId) ?? null;
          const mine = leg.user === user;
          return (
            <li
              key={leg.user}
              className={`flex items-center gap-2.5 rounded-xl border bg-[var(--panel)] px-2.5 py-2 ${
                leg.result === "hit"
                  ? "border-[var(--accent)]/50"
                  : leg.result === "miss"
                    ? "border-[var(--loss)]/40 opacity-75"
                    : "border-[var(--line)]"
              }`}
            >
              <Headshot athleteId={leg.athleteId} logo={logoOf(leg.team)} size={44} />
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[14px] font-semibold leading-tight ${
                    leg.result === "miss" ? "line-through decoration-[var(--loss)]/60" : ""
                  }`}
                >
                  {leg.name}
                </p>
                <p className="truncate text-[10px] text-[var(--muted)]">
                  <TeamLogo logo={logoOf(leg.team)} size={11} /> {leg.team} {leg.pos}
                  <span className="px-1">·</span>
                  <span className={mine ? "font-semibold text-[var(--accent)]" : "text-[var(--text)]"}>
                    {display(leg.user)}
                  </span>
                </p>
                {game && <GameLine game={game} team={leg.team} />}
              </div>
              <ResultPill result={leg.result} tds={leg.tds} />
            </li>
          );
        })}

        {missing.map((member) => (
          <li
            key={member}
            className="flex items-center gap-2.5 rounded-xl border border-dashed border-[var(--line)] px-2.5 py-2"
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--panel-2)]
                         text-[15px] font-bold text-[var(--muted)]"
            >
              {display(member).charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[14px] font-semibold leading-tight ${
                  member === user ? "text-[var(--accent)]" : ""
                }`}
              >
                {display(member)}
              </p>
              <p className="text-[10px] text-[var(--muted)]">
                {picksOpen ? "Hasn't made a selection yet" : "No selection this week"}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {anyLive && (
        <p className="px-1 pt-3 text-[10px] text-[var(--muted)]">Updates every minute while games are on.</p>
      )}
    </div>
  );
}

/** "MIN 17 – BUF 14 · Q3 4:12", or the kickoff before it starts. Player's side first. */
function GameLine({ game, team }: { game: TdGameVM; team: string }) {
  if (game.status === "scheduled") {
    const at = new Date(game.kickoffAt);
    return (
      <p className="text-[10px] text-[var(--muted)]">
        {game.shortName} · {dayLabel(at).split(",")[0]} {timeShort(at)}
      </p>
    );
  }
  const home = game.homeAbbr === team;
  const us = { abbr: team, score: home ? game.homeScore : game.awayScore };
  const them = home
    ? { abbr: game.awayAbbr, score: game.awayScore }
    : { abbr: game.homeAbbr, score: game.homeScore };
  return (
    <p className="text-[10px] tabular-nums text-[var(--muted)]">
      <span className="text-[var(--text)]">
        {us.abbr} {us.score ?? 0}
      </span>{" "}
      – {them.abbr} {them.score ?? 0}
      <span className={`pl-1 ${game.status === "in_progress" ? "text-[var(--warn)]" : ""}`}>
        · {game.statusDetail}
      </span>
    </p>
  );
}

function StatusCard({
  state,
  tally,
  legCount,
  american,
  payout,
  stake,
}: {
  state: ReturnType<typeof parlayState>["state"];
  tally: { hit: number; miss: number; live: number; pending: number; void: number };
  legCount: number;
  american: number | null;
  payout: number | null;
  stake: number;
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
  ].filter(Boolean);

  return (
    <section className="rounded-xl bg-[var(--panel)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-[17px] font-bold leading-tight ${headline.cls}`}>{headline.text}</p>
        {american !== null && (
          <p className="text-[13px] font-bold tabular-nums">{formatAmericanLong(american)}</p>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-[var(--muted)]">
        <span>{parts.join(" · ")}</span>
        {payout !== null && state !== "busted" && (
          <span>
            ${stake} {state === "cashed" ? "paid" : "pays"}{" "}
            <span className="font-semibold text-[var(--text)]">
              ${payout.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </span>
        )}
      </div>
      {/* One bar segment per leg, so the whole ticket reads at a glance. */}
      <div className="mt-2 flex gap-0.5">
        {(["hit", "live", "pending", "void", "miss"] as const).flatMap((r) =>
          Array.from({ length: tally[r] }, (_, i) => (
            <span
              key={`${r}-${i}`}
              className={`h-1.5 flex-1 rounded-full ${
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
