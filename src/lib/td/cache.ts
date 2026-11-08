/**
 * Key/value cache for the anytime-TD feeds, in `fantasy_cache`.
 *
 * That table is the app's general-purpose cache (the poll's locks live there
 * too); every key here is prefixed `td:` so the two never collide. The DB is
 * the cache for the same reason it is for Sleeper: it survives cold lambdas,
 * which matters when one cold roster pull is thirty 400KB requests.
 */
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { fantasyCache } from "@/db/schema";

export type Cached<T> = { value: T; fetchedAt: Date };

export async function readMany<T>(keys: string[]): Promise<Map<string, Cached<T>>> {
  const out = new Map<string, Cached<T>>();
  if (keys.length === 0) return out;
  const rows = await db.select().from(fantasyCache).where(inArray(fantasyCache.key, keys));
  for (const row of rows) out.set(row.key, { value: row.payload as T, fetchedAt: row.fetchedAt });
  return out;
}

export async function write<T>(key: string, value: T): Promise<void> {
  await db
    .insert(fantasyCache)
    .values({ key, payload: value as object, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: fantasyCache.key,
      set: { payload: sql`excluded.payload`, fetchedAt: sql`excluded.fetched_at` },
    });
}

/**
 * Refresh `key` with `load()` and return the new value — or, if the upstream
 * fails, whatever was there before. A flaky feed must never blank the page.
 */
export async function refresh<T>(
  key: string,
  previous: Cached<T> | undefined,
  load: () => Promise<T>
): Promise<T | null> {
  try {
    const value = await load();
    await write(key, value);
    return value;
  } catch (err) {
    console.error(`td cache refresh failed for ${key}`, err);
    return previous?.value ?? null;
  }
}

export function isFresh(entry: Cached<unknown> | undefined, ttlMs: number): boolean {
  return !!entry && Date.now() - entry.fetchedAt.getTime() < ttlMs;
}
