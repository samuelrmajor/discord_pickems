/**
 * Who closed a week, and when.
 *
 * Voting used to close on a clock — Saturday 3pm ET, whether the league had
 * finished or not. It closes on a person now: Pat presses the button when the
 * ballots are in. A week is therefore "open" until a row exists here, which
 * makes the absence of a row the normal state and a lock an explicit event
 * with an author attached.
 *
 * It rides in `fantasy_cache` rather than a table of its own: one row per
 * (season, week), keyed by string, is exactly what that table is for.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fantasyCache } from "@/db/schema";

export type WeekLock = { lockedAt: Date; by: string };

function keyFor(season: number, week: number): string {
  return `lock:${season}:${week}`;
}

type StoredLock = { lockedAt: string; by: string };

export async function getLock(season: number, week: number): Promise<WeekLock | null> {
  const [row] = await db
    .select()
    .from(fantasyCache)
    .where(eq(fantasyCache.key, keyFor(season, week)));
  if (!row) return null;
  const payload = row.payload as StoredLock;
  return { lockedAt: new Date(payload.lockedAt), by: payload.by };
}

/**
 * Close the week. Re-locking an already-locked week keeps the original time:
 * the lock is the moment voting stopped, and an accidental second press must
 * not rewrite it.
 */
export async function lockWeek(season: number, week: number, by: string): Promise<void> {
  const payload: StoredLock = { lockedAt: new Date().toISOString(), by };
  await db
    .insert(fantasyCache)
    .values({ key: keyFor(season, week), payload })
    .onConflictDoNothing();
}

/** Reopen the week, for the mis-tap. */
export async function unlockWeek(season: number, week: number): Promise<void> {
  await db.delete(fantasyCache).where(eq(fantasyCache.key, keyFor(season, week)));
}
