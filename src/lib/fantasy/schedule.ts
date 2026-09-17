/**
 * Who each NFL team plays in a given week, so a roster can show the matchup
 * next to every player.
 *
 * The schedule comes from the ESPN client the pick'em module already uses
 * rather than from Sleeper, which has no clean schedule endpoint. That means
 * reconciling two sets of team abbreviations.
 */
import type { EspnGame } from "../espn";

/** Sleeper abbreviation -> this week's matchup. Teams on bye are absent. */
export type Schedule = Record<string, { opponent: string; home: boolean }>;

/**
 * ESPN and Sleeper agree on 31 of 32 abbreviations; Washington is the lone
 * exception. Checked by diffing both feeds' team sets — see the note in the
 * module docs if a future season adds another.
 */
const ESPN_TO_SLEEPER: Record<string, string> = { WSH: "WAS" };

function toSleeper(abbr: string): string {
  return ESPN_TO_SLEEPER[abbr] ?? abbr;
}

export function buildSchedule(games: EspnGame[]): Schedule {
  const schedule: Schedule = {};
  for (const game of games) {
    const home = toSleeper(game.homeAbbr);
    const away = toSleeper(game.awayAbbr);
    schedule[home] = { opponent: away, home: true };
    schedule[away] = { opponent: home, home: false };
  }
  return schedule;
}

/**
 * A player's matchup, ready to render: "@SEA" away, "vs SEA" home, "BYE" when
 * their team isn't playing, and null for a free agent with no team at all.
 *
 * An empty schedule (ESPN unreachable when the snapshot was built) yields null
 * rather than marking the whole league on bye.
 */
export function matchupFor(team: string | null, schedule: Schedule): string | null {
  if (!team) return null;
  if (Object.keys(schedule).length === 0) return null;
  const game = schedule[team];
  if (!game) return "BYE";
  return game.home ? `vs ${game.opponent}` : `@${game.opponent}`;
}
