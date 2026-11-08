/**
 * Each member's anytime-TD leg, as the Discord reminder needs it.
 *
 * Only members the module is open to are included (it is gated in `modules`),
 * so a module still being tried out never chases the rest of the league.
 */
import { fetchCalendar } from "../espn";
import { canSeeModule } from "../modules";
import { getWeekGames } from "../queries";
import { ensureWeekFresh } from "../sync";
import { loadLines } from "./data";
import { getWeekTdPicks } from "./picks";

export type TdCell = {
  /** The player they picked, or null if they haven't. */
  player: string | null;
  /** They picked someone DraftKings has no anytime-TD line for. */
  noLine: boolean;
  /** Nothing left to do: a pick is in, or every game has kicked off. */
  done: boolean;
};

export function canSeeTd(member: string): boolean {
  return canSeeModule(member, "touchdowns");
}

/**
 * Best effort, like the pick'em column: this reaches ESPN, and a reminder that
 * can still chase everything else beats one that fails because a feed is down.
 * Null means "couldn't tell", and the checklist prints "?".
 */
export async function tdProgress(members: string[]): Promise<Map<string, TdCell> | null> {
  const visible = members.filter(canSeeTd);
  if (visible.length === 0) return new Map();

  try {
    const { season, currentWeek } = await fetchCalendar();
    await ensureWeekFresh(season, currentWeek);
    const games = await getWeekGames(season, currentWeek);
    const [picks, lines] = await Promise.all([
      getWeekTdPicks(season, currentWeek),
      loadLines(games),
    ]);

    const anyOpen = games.some((g) => g.kickoffAt.getTime() > Date.now());
    const byUser = new Map(picks.map((p) => [p.userName, p]));

    return new Map(
      visible.map((member) => {
        const pick = byUser.get(member);
        return [
          member,
          {
            player: pick?.athleteName ?? null,
            noLine: pick ? lines.get(pick.gameId)?.has(pick.athleteId) === false : false,
            done: Boolean(pick) || !anyOpen,
          },
        ];
      })
    );
  } catch (err) {
    console.error("anytime-TD progress unavailable for the reminder", err);
    return null;
  }
}
