import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { fantasyCache } from "@/db/schema";
import { LEAGUE_ID } from "./config";
import {
  buildProfiles,
  rosterVersion,
  toCard,
  toRosters,
  type LeagueSnapshot,
  type ProfileCard,
  type ProfileRosters,
} from "./profiles";
import {
  fetchLeague,
  fetchMatchups,
  fetchPlayers,
  fetchRosters,
  fetchState,
  fetchUsers,
} from "./sleeper";

export type {
  LastResult,
  LeagueSnapshot,
  Profile,
  ProfileCard,
  ProfileRosters,
  RosterLine,
} from "./profiles";

/**
 * How long each upstream resource stays good. The player dump barely moves and
 * costs 11MB to refetch; rosters and matchups move every Sunday.
 */
const TTL = {
  state: 10 * 60 * 1000,
  league: 3 * 60 * 60 * 1000,
  users: 30 * 60 * 1000,
  rosters: 5 * 60 * 1000,
  matchups: 5 * 60 * 1000,
  players: 7 * 24 * 60 * 60 * 1000,
} as const;

/** The processed snapshot is rebuilt whenever any source under it refreshes. */
const SNAPSHOT_KEY = "snapshot";
const SNAPSHOT_TTL = TTL.rosters;

// ---------------------------------------------------------------- cache

type CacheHit<T> = { value: T; fetchedAt: Date };

async function readCache<T>(key: string): Promise<CacheHit<T> | null> {
  const [row] = await db.select().from(fantasyCache).where(eq(fantasyCache.key, key));
  return row ? { value: row.payload as T, fetchedAt: row.fetchedAt } : null;
}

async function writeCache(key: string, payload: unknown): Promise<void> {
  const fetchedAt = new Date();
  await db
    .insert(fantasyCache)
    .values({ key, payload: payload as object, fetchedAt })
    .onConflictDoUpdate({
      target: fantasyCache.key,
      set: { payload: payload as object, fetchedAt },
    });
}

/**
 * Serve `key` from the cache, refetching when it has aged past `ttl`.
 *
 * A failed refetch falls back to the stale copy rather than throwing: Sleeper
 * being briefly unreachable should show slightly old records, not a broken
 * page. Only a miss with no cached copy at all propagates the error.
 */
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = await readCache<T>(key);
  if (hit && Date.now() - hit.fetchedAt.getTime() < ttl) return hit.value;

  try {
    const fresh = await load();
    await writeCache(key, fresh);
    return fresh;
  } catch (err) {
    if (hit) {
      console.error(`sleeper refresh failed for ${key}; serving stale`, err);
      return hit.value;
    }
    throw err;
  }
}

// ---------------------------------------------------------------- entry points

/** The stored snapshot, or null if we have never successfully built one. */
export async function readSnapshot(): Promise<LeagueSnapshot | null> {
  const hit = await readCache<LeagueSnapshot>(SNAPSHOT_KEY);
  return hit?.value ?? null;
}

export async function snapshotIsStale(): Promise<boolean> {
  const hit = await readCache<LeagueSnapshot>(SNAPSHOT_KEY);
  return !hit || Date.now() - hit.fetchedAt.getTime() > SNAPSHOT_TTL;
}

/**
 * Pull everything we need from Sleeper (honouring each resource's TTL), fold it
 * into per-member profiles, and store the result. Safe to call concurrently:
 * the worst case is two requests doing the same work and writing the same row.
 */
export async function refreshSnapshot(): Promise<LeagueSnapshot> {
  const state = await cached("state", TTL.state, fetchState);
  const league = await cached("league", TTL.league, () => fetchLeague(LEAGUE_ID));
  const [users, rosters, players] = await Promise.all([
    cached("users", TTL.users, () => fetchUsers(LEAGUE_ID)),
    cached("rosters", TTL.rosters, () => fetchRosters(LEAGUE_ID)),
    cached("players", TTL.players, fetchPlayers),
  ]);

  const lastScoredWeek = league.lastScoredWeek || Math.max(0, state.week - 1);
  const matchups =
    lastScoredWeek > 0
      ? await cached(`matchups:${state.season}:${lastScoredWeek}`, TTL.matchups, () =>
          fetchMatchups(LEAGUE_ID, lastScoredWeek)
        )
      : [];

  const profiles = buildProfiles(users, rosters, players, matchups, lastScoredWeek);
  const snapshot: LeagueSnapshot = {
    leagueName: league.name,
    season: state.season,
    nflWeek: state.week,
    seasonStartDate: state.seasonStartDate,
    lastScoredWeek,
    profiles,
    rosterVersion: rosterVersion(profiles),
    builtAt: new Date().toISOString(),
  };

  await writeCache(SNAPSHOT_KEY, snapshot);
  return snapshot;
}

/**
 * The rosters alone, for the lazy fetch. Returns null when the caller's version
 * no longer matches what we hold, so a client asking for a superseded version
 * is told to take the current one rather than being handed stale rosters.
 */
export async function readRosters(): Promise<{
  version: string;
  rosters: Record<string, ProfileRosters>;
} | null> {
  const snapshot = await readSnapshot();
  if (!snapshot) return null;
  return { version: snapshot.rosterVersion, rosters: toRosters(snapshot.profiles) };
}

/** The ranking board's view of the league: profiles minus their rosters. */
export async function readCards(): Promise<{
  cards: ProfileCard[];
  rosterVersion: string;
  snapshot: LeagueSnapshot;
} | null> {
  const snapshot = await readSnapshot();
  if (!snapshot) return null;
  return {
    cards: snapshot.profiles.map(toCard),
    rosterVersion: snapshot.rosterVersion,
    snapshot,
  };
}

/** Drop cached upstream payloads so the next refresh refetches from Sleeper. */
export async function invalidateFantasyCache(keys?: string[]): Promise<void> {
  if (keys?.length) await db.delete(fantasyCache).where(inArray(fantasyCache.key, keys));
  else await db.delete(fantasyCache);
}
