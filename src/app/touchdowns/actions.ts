"use server";

import { revalidatePath } from "next/cache";
import { fetchCalendar } from "@/lib/espn";
import { canSeeModule } from "@/lib/modules";
import { getWeekGames } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { findPlayer, priceFor, warmPrices } from "@/lib/td/data";
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
  return { ok: true };
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
