"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { GameRow } from "@/db/schema";
import { postToGambling } from "@/lib/discord";
import { fetchCalendar } from "@/lib/espn";
import { canSeeModule } from "@/lib/modules";
import { getWeekGames } from "@/lib/queries";
import { memberByName } from "@/lib/fantasy/config";
import { getCurrentUser } from "@/lib/session";
import { pickAnnouncement } from "@/lib/td/announce";
import { findPlayer, legPrices, loadLines, priceFor, warmPrices } from "@/lib/td/data";
import type { RosterPlayer } from "@/lib/td/espn";
import { USERS } from "@/lib/users";
import { clearTdPick, getWeekTdPicks, saveTdPick } from "@/lib/td/picks";

export type TdResult = { ok: true } | { ok: false; error: string };

async function context(week: number) {
  const user = await getCurrentUser();
  if (!user) return { error: "not signed in" } as const;
  if (!canSeeModule(user, "touchdowns")) return { error: "not available" } as const;
  if (!Number.isInteger(week) || week < 1 || week > 18) return { error: "no such week" } as const;

  const { season } = await fetchCalendar();
  const weekGames = await getWeekGames(season, week);
  return { user, season, weekGames } as const;
}

/**
 * Lock a player in as this member's leg. Re-checked here rather than trusted
 * from the client: a leg can't change once either the old or the new player's
 * game has kicked off, and a player someone else holds can't be taken.
 */
export async function pickPlayer(week: number, athleteId: string): Promise<TdResult> {
  const ctx = await context(week);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { user, season, weekGames } = ctx;

  const found = await findPlayer(season, weekGames, athleteId);
  if (!found) return { ok: false, error: "that player isn't playing this week" };
  const { player, game } = found;
  if (game.kickoffAt.getTime() <= Date.now()) {
    return { ok: false, error: `${game.shortName} has already kicked off` };
  }

  const picks = await getWeekTdPicks(season, week);
  const mine = picks.find((p) => p.userName === user);
  if (mine && mine.athleteId === athleteId) return { ok: true };
  const mineGame = mine && weekGames.find((g) => g.id === mine.gameId);
  if (mineGame && mineGame.kickoffAt.getTime() <= Date.now()) {
    return { ok: false, error: `your pick is locked — ${mineGame.shortName} has kicked off` };
  }

  const holder = picks.find((p) => p.athleteId === athleteId);
  if (holder) return { ok: false, error: `${display(holder.userName)} already has ${player.name}` };

  const saved = await saveTdPick({
    season,
    week,
    userName: user,
    athleteId,
    athleteName: player.name,
    position: player.pos,
    teamAbbr: player.team,
    gameId: game.id,
  });
  if (!saved) return { ok: false, error: `someone just took ${player.name}` };

  revalidatePath("/touchdowns");
  // After the response, so the pick is saved and shown without waiting on Discord.
  after(() =>
    announcePick({ season, week, user, weekGames, player, game, previous: mine?.athleteName ?? null })
  );
  return { ok: true };
}

/** Everyone puts in a dollar, the same as the page. */
const STAKE_PER_MEMBER = 1;

/**
 * Tell #gambling about a pick. Best effort: a failed post is logged and
 * dropped, never surfaced — the pick itself already stands.
 */
async function announcePick(p: {
  season: number;
  week: number;
  user: string;
  weekGames: GameRow[];
  player: RosterPlayer;
  game: GameRow;
  previous: string | null;
}): Promise<void> {
  try {
    // Re-read so the count includes anyone who picked at the same moment.
    const picks = await getWeekTdPicks(p.season, p.week);
    const [prices, lines] = await Promise.all([
      legPrices(p.weekGames, picks, p.game.id),
      loadLines([p.game]),
    ]);
    await postToGambling(
      pickAnnouncement({
        week: p.week,
        who: memberByName(p.user)?.realName ?? display(p.user),
        player: p.player,
        previous: p.previous,
        game: p.game,
        line: lines.get(p.game.id)?.has(p.player.id) ?? null,
        price: prices.get(p.player.id) ?? null,
        legs: picks.map((pick) => prices.get(pick.athleteId) ?? null),
        members: USERS.length,
        stake: STAKE_PER_MEMBER * USERS.length,
      })
    );
  } catch (err) {
    console.error("couldn't announce the TD pick in #gambling", err);
  }
}

export async function clearPick(week: number): Promise<TdResult> {
  const ctx = await context(week);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { user, season, weekGames } = ctx;

  const mine = (await getWeekTdPicks(season, week)).find((p) => p.userName === user);
  if (!mine) return { ok: true };
  const game = weekGames.find((g) => g.id === mine.gameId);
  if (game && game.kickoffAt.getTime() <= Date.now()) {
    return { ok: false, error: `your pick is locked — ${game.shortName} has kicked off` };
  }

  await clearTdPick(season, week, user);
  revalidatePath("/touchdowns");
  return { ok: true };
}

export type Preview =
  /** `prices` is keyed by `nameKey(player name)`, the game's whole sheet. */
  | { ok: true; price: number | null; prices: Record<string, number> }
  | { ok: false; error: string };

/**
 * A player's current price, fetched now if the cached one is over an hour old.
 *
 * This is what spends Odds API credits on demand — at most one per game per
 * hour — so the screen can show what the parlay becomes before committing.
 * The whole game's sheet comes back with it, so the search list fills in
 * every other player in that game as a side effect.
 */
export async function previewPlayer(week: number, athleteId: string): Promise<Preview> {
  const ctx = await context(week);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { season, weekGames } = ctx;

  const found = await findPlayer(season, weekGames, athleteId);
  if (!found) return { ok: false, error: "that player isn't playing this week" };

  const index = await warmPrices(found.game);
  return { ok: true, price: priceFor(index, found.player.name), prices: index };
}

function display(name: string): string {
  return name
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
