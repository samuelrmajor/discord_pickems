import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, picks, users, type GameRow, type PickRow } from "@/db/schema";
import { USERS } from "./users";

/** Idempotent: make sure the twelve league members exist as rows. */
export async function ensureUsersSeeded(): Promise<void> {
  await db
    .insert(users)
    .values(USERS.map((name) => ({ name })))
    .onConflictDoNothing();
}

export async function getWeekGames(season: number, week: number): Promise<GameRow[]> {
  return db
    .select()
    .from(games)
    .where(and(eq(games.season, season), eq(games.week, week)))
    .orderBy(games.kickoffAt, games.id);
}

export async function getSeasonGames(season: number): Promise<GameRow[]> {
  return db.select().from(games).where(eq(games.season, season));
}

async function picksForGames(gameIds: string[]): Promise<PickRow[]> {
  if (gameIds.length === 0) return [];
  return db.select().from(picks).where(inArray(picks.gameId, gameIds));
}

export async function getWeekPicks(weekGames: GameRow[]): Promise<PickRow[]> {
  return picksForGames(weekGames.map((g) => g.id));
}

export async function getSeasonPicks(seasonGames: GameRow[]): Promise<PickRow[]> {
  return picksForGames(seasonGames.map((g) => g.id));
}

/** Write a single pick. Returns false if the game has already kicked off. */
export async function savePick(
  userName: string,
  gameId: string,
  choice: "home" | "away"
): Promise<boolean> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) return false;
  if (game.kickoffAt.getTime() <= Date.now()) return false;

  await db
    .insert(picks)
    .values({ userName, gameId, choice, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [picks.userName, picks.gameId],
      set: { choice, updatedAt: new Date() },
    });
  return true;
}

export type BulkMode = "home" | "away" | "favorite";

/**
 * Apply a bulk selection across a week. Only unlocked games are touched, and
 * with `overwrite: false` existing picks are left alone — so the first tap
 * fills in the blanks rather than wiping a card someone already thought about.
 */
export async function saveBulkPicks(
  userName: string,
  season: number,
  week: number,
  mode: BulkMode,
  overwrite: boolean
): Promise<{ applied: number; skipped: number }> {
  const weekGames = await getWeekGames(season, week);
  const existing = await db.select().from(picks).where(eq(picks.userName, userName));
  const existingIds = new Set(existing.map((p) => p.gameId));

  const now = Date.now();
  const rows: { userName: string; gameId: string; choice: "home" | "away"; updatedAt: Date }[] = [];
  let skipped = 0;

  for (const game of weekGames) {
    if (game.kickoffAt.getTime() <= now) {
      skipped += 1;
      continue;
    }
    if (!overwrite && existingIds.has(game.id)) {
      skipped += 1;
      continue;
    }
    const choice =
      mode === "favorite" ? (game.favorite as "home" | "away" | null) : mode;
    if (!choice) {
      // No line published for this game yet — nothing to ride.
      skipped += 1;
      continue;
    }
    rows.push({ userName, gameId: game.id, choice, updatedAt: new Date() });
  }

  if (rows.length > 0) {
    await db
      .insert(picks)
      .values(rows)
      .onConflictDoUpdate({
        target: [picks.userName, picks.gameId],
        set: { choice: sql`excluded.choice`, updatedAt: new Date() },
      });
  }

  return { applied: rows.length, skipped };
}

/** One member's picks for a week, as the database actually holds them. */
export async function getUserWeekPicks(
  userName: string,
  season: number,
  week: number
): Promise<Record<string, "home" | "away">> {
  const weekGames = await getWeekGames(season, week);
  const weekGameIds = new Set(weekGames.map((g) => g.id));
  const rows = await db.select().from(picks).where(eq(picks.userName, userName));

  const out: Record<string, "home" | "away"> = {};
  for (const row of rows) {
    if (weekGameIds.has(row.gameId)) out[row.gameId] = row.choice as "home" | "away";
  }
  return out;
}

/**
 * Write a whole card at once and report back what the database then holds.
 *
 * This is the "lock in" path, and it exists because optimistic saving can lie.
 * A tap that never reached the server still paints the button green, so the
 * board could show a full card while the league saw one pick. Re-sending every
 * selection makes that recoverable in one tap, and reading the rows back
 * afterwards means the answer is the stored truth rather than another
 * assumption about it.
 */
export async function confirmPicks(
  userName: string,
  season: number,
  week: number,
  desired: Record<string, "home" | "away">
): Promise<{
  saved: Record<string, "home" | "away">;
  stored: number;
  /** Selections that could not be written, because the game had kicked off. */
  rejected: string[];
}> {
  const weekGames = await getWeekGames(season, week);
  const now = Date.now();

  const rows: { userName: string; gameId: string; choice: "home" | "away"; updatedAt: Date }[] = [];
  const rejected: string[] = [];

  for (const game of weekGames) {
    const choice = desired[game.id];
    if (!choice) continue;
    if (game.kickoffAt.getTime() <= now) {
      rejected.push(game.id);
      continue;
    }
    rows.push({ userName, gameId: game.id, choice, updatedAt: new Date() });
  }

  if (rows.length > 0) {
    await db
      .insert(picks)
      .values(rows)
      .onConflictDoUpdate({
        target: [picks.userName, picks.gameId],
        set: { choice: sql`excluded.choice`, updatedAt: new Date() },
      });
  }

  const saved = await getUserWeekPicks(userName, season, week);
  return { saved, stored: Object.keys(saved).length, rejected };
}
