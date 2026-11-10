/**
 * Everything the anytime-TD screen shows for one week, and how fresh it is.
 *
 * Four feeds, each with its own refresh rule, because they cost very
 * different amounts and go stale at very different speeds:
 *
 *   rosters  ESPN, free but ~400KB a team     12h, and only for games not yet started
 *   lines    ESPN, free                       20m, until kickoff, then frozen
 *   box      ESPN, free                       1m while live; frozen once final
 *   prices   The Odds API, 1 credit per game  6h, only for games someone picked in
 *
 * Prices are the only one that spends anything, so they are never refreshed
 * just because someone opened the page and nobody has a player in that game.
 * Previewing a player is what fetches a game's prices the first time.
 */
import type { GameRow, TdPickRow } from "@/db/schema";
import { isFresh, readMany, refresh, write, type Cached } from "./cache";
import { fetchAnytimeLines, fetchBoxScore, fetchRoster, type BoxScore, type RosterPlayer } from "./espn";
import {
  fetchAnytimePrices,
  fetchOddsEvents,
  matchEvent,
  oddsApiConfigured,
  type OddsEvent,
} from "./odds-api";
import { gradeLeg, nameKey, type LegResult } from "./odds";

const MIN = 60 * 1000;
const ROSTER_TTL_MS = 12 * 60 * MIN;
const LINES_TTL_MS = 20 * MIN;
const BOX_LIVE_TTL_MS = 1 * MIN;
const PRICE_TTL_MS = 6 * 60 * MIN;
/** How stale a price may be when someone is actively previewing that game. */
export const PREVIEW_PRICE_TTL_MS = 60 * MIN;
const EVENTS_TTL_MS = 6 * 60 * MIN;
/**
 * Below this many credits left for the month, stop refreshing prices in the
 * background and keep what's left for previews, which someone is waiting on.
 */
const QUOTA_RESERVE = 25;

const keys = {
  roster: (season: number, team: string) => `td:roster:${season}:${team}`,
  lines: (gameId: string) => `td:lines:${gameId}`,
  box: (gameId: string) => `td:box:${gameId}`,
  prices: (gameId: string) => `td:prices:${gameId}`,
  events: "td:odds-events",
  quota: "td:odds-quota",
};

type StoredBox = BoxScore & { final: boolean };
type StoredPrices = { prices: Record<string, number> };

const started = (g: GameRow) => g.kickoffAt.getTime() <= Date.now();

// ---------------------------------------------------------------- view models

export type TdGameVM = {
  id: string;
  shortName: string;
  kickoffAt: string;
  homeAbbr: string;
  awayAbbr: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "in_progress" | "final";
  statusDetail: string;
  locked: boolean;
  /** Whether we have read this game's prop list at all. */
  linesKnown: boolean;
  /** When this game's prices were last fetched, or null if never. */
  pricedAt: string | null;
};

export type TdPlayerVM = {
  id: string;
  name: string;
  pos: string;
  team: string;
  opp: string;
  gameId: string;
  injury: string | null;
  /** DraftKings has an anytime-TD market up. Null when the game's props are unread. */
  line: boolean | null;
  price: number | null;
  takenBy: string | null;
};

export type TdLegVM = {
  user: string;
  athleteId: string;
  name: string;
  pos: string;
  team: string;
  gameId: string;
  shortName: string;
  kickoffAt: string;
  locked: boolean;
  line: boolean | null;
  price: number | null;
  result: LegResult;
  /** Touchdowns he has so far. Zero until he scores. */
  tds: number;
};

export type TdWeek = {
  games: TdGameVM[];
  players: TdPlayerVM[];
  legs: TdLegVM[];
  pricesEnabled: boolean;
};

// ---------------------------------------------------------------- loaders

async function loadRosters(season: number, weekGames: GameRow[]): Promise<RosterPlayer[]> {
  const teams = weekGames.flatMap((g) => [
    { team: g.homeAbbr, open: !started(g) },
    { team: g.awayAbbr, open: !started(g) },
  ]);
  const cache = await readMany<RosterPlayer[]>(teams.map((t) => keys.roster(season, t.team)));

  const lists = await Promise.all(
    teams.map(async ({ team, open }) => {
      const key = keys.roster(season, team);
      const hit = cache.get(key);
      // A started game's players can't be picked, so there is no reason to pay
      // for a fresh roster — but a week opened cold still needs names once.
      if (hit && (!open || isFresh(hit, ROSTER_TTL_MS))) return hit.value;
      return (await refresh(key, hit, () => fetchRoster(team))) ?? [];
    })
  );
  return lists.flat();
}

export async function loadLines(weekGames: GameRow[]): Promise<Map<string, Set<string>>> {
  const cache = await readMany<string[]>(weekGames.map((g) => keys.lines(g.id)));
  const out = new Map<string, Set<string>>();

  await Promise.all(
    weekGames.map(async (game) => {
      const key = keys.lines(game.id);
      const hit = cache.get(key);
      // Books pull props at kickoff; the last pre-game read is the one that counts.
      const ids =
        hit && (started(game) || isFresh(hit, LINES_TTL_MS))
          ? hit.value
          : started(game)
            ? null
            : await refresh(key, hit, () => fetchAnytimeLines(game.id));
      if (ids) out.set(game.id, new Set(ids));
    })
  );
  return out;
}

async function loadBoxes(games: GameRow[]): Promise<Map<string, BoxScore>> {
  const cache = await readMany<StoredBox>(games.map((g) => keys.box(g.id)));
  const out = new Map<string, BoxScore>();

  await Promise.all(
    games.map(async (game) => {
      const key = keys.box(game.id);
      const hit = cache.get(key);
      const frozen = hit?.value.final === true;
      const box =
        hit && (frozen || isFresh(hit, BOX_LIVE_TTL_MS))
          ? hit.value
          : await refresh(key, hit, async () => ({
              ...(await fetchBoxScore(game.id)),
              final: game.status === "final",
            }));
      if (box) out.set(game.id, box);
    })
  );
  return out;
}

async function oddsEvents(): Promise<OddsEvent[]> {
  const cache = await readMany<OddsEvent[]>([keys.events]);
  const hit = cache.get(keys.events);
  if (isFresh(hit, EVENTS_TTL_MS)) return hit!.value;
  return (await refresh(keys.events, hit, fetchOddsEvents)) ?? [];
}

async function quotaLow(): Promise<boolean> {
  const hit = (await readMany<{ remaining: number }>([keys.quota])).get(keys.quota);
  return hit ? hit.value.remaining < QUOTA_RESERVE : false;
}

async function fetchPricesFor(game: GameRow): Promise<StoredPrices> {
  const event = matchEvent(await oddsEvents(), game);
  if (!event) return { prices: {} };
  const sheet = await fetchAnytimePrices(event.id);
  if (sheet.remaining !== null) await write(keys.quota, { remaining: sheet.remaining });
  return { prices: sheet.prices };
}

/**
 * Prices for a set of games. `refreshable` names the games allowed to spend a
 * credit this call; every other game is served from cache or not at all.
 */
async function loadPrices(
  weekGames: GameRow[],
  refreshable: Set<string>,
  ttlMs: number
): Promise<Map<string, Cached<StoredPrices>>> {
  const cache = await readMany<StoredPrices>(weekGames.map((g) => keys.prices(g.id)));
  const out = new Map<string, Cached<StoredPrices>>();
  const configured = oddsApiConfigured();
  const low = configured && ttlMs === PRICE_TTL_MS && (await quotaLow());

  await Promise.all(
    weekGames.map(async (game) => {
      const key = keys.prices(game.id);
      const hit = cache.get(key);
      const mayFetch =
        configured && !low && refreshable.has(game.id) && !started(game) && !isFresh(hit, ttlMs);
      if (!mayFetch) {
        if (hit) out.set(game.id, hit);
        return;
      }
      const value = await refresh(key, hit, () => fetchPricesFor(game));
      if (value) out.set(game.id, { value, fetchedAt: new Date() });
    })
  );
  return out;
}

/** Fetch one game's prices now if they are older than the preview TTL. */
export async function warmPrices(game: GameRow): Promise<Record<string, number>> {
  const map = await loadPrices([game], new Set([game.id]), PREVIEW_PRICE_TTL_MS);
  return priceIndex(map.get(game.id)?.value.prices ?? {});
}

function priceIndex(prices: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, price] of Object.entries(prices)) out[nameKey(name)] = price;
  return out;
}

export function priceFor(index: Record<string, number>, name: string): number | null {
  return index[nameKey(name)] ?? null;
}

/**
 * Each pick's anytime-TD price, by athlete id, for the Discord reminder. Same
 * cache and credit rules as the page: only games someone has picked in, no
 * more than once per game per `PRICE_TTL_MS`, and frozen at kickoff.
 */
export async function loadPickPrices(
  weekGames: GameRow[],
  picks: TdPickRow[]
): Promise<Map<string, number | null>> {
  const prices = await loadPrices(weekGames, new Set(picks.map((p) => p.gameId)), PRICE_TTL_MS);
  return new Map(
    picks.map((pick) => {
      const sheet = prices.get(pick.gameId)?.value.prices;
      return [pick.athleteId, sheet ? priceFor(priceIndex(sheet), pick.athleteName) : null];
    })
  );
}

// ---------------------------------------------------------------- assembly

export async function loadTdWeek(
  season: number,
  weekGames: GameRow[],
  picks: TdPickRow[]
): Promise<TdWeek> {
  const pickedGames = new Set(picks.map((p) => p.gameId));
  const startedPicked = weekGames.filter((g) => started(g) && pickedGames.has(g.id));

  const [roster, lines, boxes, prices] = await Promise.all([
    loadRosters(season, weekGames),
    loadLines(weekGames),
    loadBoxes(startedPicked),
    loadPrices(weekGames, pickedGames, PRICE_TTL_MS),
  ]);

  const gameById = new Map(weekGames.map((g) => [g.id, g]));
  const indexes = new Map(
    [...prices].map(([id, hit]) => [id, priceIndex(hit.value.prices)] as const)
  );
  const takenBy = new Map(picks.map((p) => [p.athleteId, p.userName]));

  const games: TdGameVM[] = weekGames.map((g) => ({
    id: g.id,
    shortName: g.shortName,
    kickoffAt: g.kickoffAt.toISOString(),
    homeAbbr: g.homeAbbr,
    awayAbbr: g.awayAbbr,
    homeLogo: g.homeLogo,
    awayLogo: g.awayLogo,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    status: g.status as TdGameVM["status"],
    statusDetail: g.statusDetail,
    locked: started(g),
    linesKnown: lines.has(g.id),
    pricedAt: prices.get(g.id)?.fetchedAt.toISOString() ?? null,
  }));

  const gameOf = (team: string) =>
    weekGames.find((g) => g.homeAbbr === team || g.awayAbbr === team);

  const players: TdPlayerVM[] = [];
  const seen = new Set<string>();
  for (const p of roster) {
    const game = gameOf(p.team);
    // A player can appear twice when a roster lists him in two groups.
    if (!game || seen.has(p.id)) continue;
    seen.add(p.id);
    const gameLines = lines.get(game.id);
    const index = indexes.get(game.id);
    players.push({
      id: p.id,
      name: p.name,
      pos: p.pos,
      team: p.team,
      opp: game.homeAbbr === p.team ? game.awayAbbr : game.homeAbbr,
      gameId: game.id,
      injury: p.injury,
      line: gameLines ? gameLines.has(p.id) : null,
      price: index ? priceFor(index, p.name) : null,
      takenBy: takenBy.get(p.id) ?? null,
    });
  }

  const legs: TdLegVM[] = picks.flatMap((pick) => {
    const game = gameById.get(pick.gameId);
    if (!game) return [];
    const gameLines = lines.get(game.id);
    const index = indexes.get(game.id);
    const box = boxes.get(game.id) ?? null;
    const scored = box?.scorers.includes(pick.athleteId) ?? false;
    return [
      {
        user: pick.userName,
        athleteId: pick.athleteId,
        name: pick.athleteName,
        pos: pick.position,
        team: pick.teamAbbr,
        gameId: game.id,
        shortName: game.shortName,
        kickoffAt: game.kickoffAt.toISOString(),
        locked: started(game),
        line: gameLines ? gameLines.has(pick.athleteId) : null,
        price: index ? priceFor(index, pick.athleteName) : null,
        result: gradeLeg(game.status as TdGameVM["status"], box, pick.athleteId),
        tds: scored ? (box?.counts?.[pick.athleteId] ?? 1) : 0,
      },
    ];
  });

  return { games, players, legs, pricesEnabled: oddsApiConfigured() };
}

/** Find a player in this week's rosters, for validating a pick server-side. */
export async function findPlayer(
  season: number,
  weekGames: GameRow[],
  athleteId: string
): Promise<{ player: RosterPlayer; game: GameRow } | null> {
  const roster = await loadRosters(season, weekGames);
  const player = roster.find((p) => p.id === athleteId);
  if (!player) return null;
  const game = weekGames.find((g) => g.homeAbbr === player.team || g.awayAbbr === player.team);
  return game ? { player, game } : null;
}
