import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { fetchWeek, type EspnGame, type Side } from "./espn";

/** Refresh cadence: fast while games are live, lazy otherwise. */
const STALE_LIVE_MS = 45 * 1000;
const STALE_IDLE_MS = 15 * 60 * 1000;

function drawCoinFlip(): Side {
  return Math.random() < 0.5 ? "home" : "away";
}

/**
 * Upsert one week of ESPN games.
 *
 * Two fields are deliberately protected on the update path:
 *  - `coinFlip` is drawn exactly once, at insert, so the tie-break is fixed
 *    and knowable before anyone votes.
 *  - `favorite`/`spread` are only refreshed when the feed actually carries
 *    odds; ESPN drops `odds` from games once they finish, and we must not let
 *    that erase the line we recorded pre-kickoff.
 */
export async function syncWeek(season: number, week: number): Promise<number> {
  const fetched = await fetchWeek(season, week);
  if (fetched.length === 0) return 0;

  const rows = fetched.map((g: EspnGame) => ({
    id: g.id,
    season: g.season,
    week: g.week,
    kickoffAt: g.kickoffAt,
    shortName: g.shortName,
    homeAbbr: g.homeAbbr,
    homeName: g.homeName,
    homeLogo: g.homeLogo,
    awayAbbr: g.awayAbbr,
    awayName: g.awayName,
    awayLogo: g.awayLogo,
    favorite: g.favorite,
    spread: g.spread,
    coinFlip: drawCoinFlip(),
    status: g.status,
    statusDetail: g.statusDetail,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    winner: g.winner,
    updatedAt: new Date(),
  }));

  await db
    .insert(games)
    .values(rows)
    .onConflictDoUpdate({
      target: games.id,
      set: {
        kickoffAt: sql`excluded.kickoff_at`,
        shortName: sql`excluded.short_name`,
        homeLogo: sql`excluded.home_logo`,
        awayLogo: sql`excluded.away_logo`,
        status: sql`excluded.status`,
        statusDetail: sql`excluded.status_detail`,
        homeScore: sql`excluded.home_score`,
        awayScore: sql`excluded.away_score`,
        winner: sql`excluded.winner`,
        // Keep the last known line if the incoming payload has none.
        favorite: sql`coalesce(excluded.favorite, ${games.favorite})`,
        spread: sql`coalesce(excluded.spread, ${games.spread})`,
        // coinFlip intentionally absent — immutable once drawn.
        updatedAt: sql`now()`,
      },
    });

  return rows.length;
}

/**
 * Sync only if our copy of the week has gone stale. Called on every page load,
 * which keeps scores current without needing a cron (Vercel's Hobby tier only
 * allows daily crons, which is useless during a Sunday slate).
 */
export async function ensureWeekFresh(season: number, week: number): Promise<void> {
  const existing = await db
    .select({
      updatedAt: games.updatedAt,
      status: games.status,
      kickoffAt: games.kickoffAt,
    })
    .from(games)
    .where(and(eq(games.season, season), eq(games.week, week)));

  if (existing.length === 0) {
    await syncWeek(season, week);
    return;
  }

  const now = Date.now();
  const oldest = Math.min(...existing.map((r) => r.updatedAt.getTime()));

  // "Live" covers in-progress games and any game whose kickoff has passed but
  // that we still have marked scheduled (i.e. our data is behind reality).
  const live = existing.some(
    (r) => r.status === "in_progress" || (r.status !== "final" && r.kickoffAt.getTime() <= now)
  );

  const threshold = live ? STALE_LIVE_MS : STALE_IDLE_MS;
  if (now - oldest > threshold) {
    try {
      await syncWeek(season, week);
    } catch (err) {
      // A flaky upstream must never blank the page; serve what we have.
      console.error("syncWeek failed", { season, week, err });
    }
  }
}
