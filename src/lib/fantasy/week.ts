import { addDays, backTo, civilFromISO, etToInstant, type Civil } from "./time";

/** Voting opens Tuesday 1:00am ET and locks Saturday 3:00pm ET. */
const OPEN_HOUR = 1;
const LOCK_HOUR = 15;
/** Days from the week's Tuesday to its deadline. */
const LOCK_DAY_OFFSET = 4;
const TUESDAY = 2;
const LAST_WEEK = 18;

export type RankingWeek = {
  week: number;
  /** The week's anchor Tuesday, in ET. Scheduled posts hang off this. */
  tuesday: Civil;
  /** Ballots become editable. */
  opensAt: Date;
  /** Ballots freeze and everyone's votes become visible. */
  locksAt: Date;
};

/**
 * Build every week's window for a season from Sleeper's `season_start_date`.
 *
 * Anchoring on the Tuesday on or before that date puts week 1's window on the
 * Tuesday preceding the week 1 Thursday opener, and every later week is the
 * same wall-clock time seven days on. Deriving all 18 from one anchor means the
 * windows stay evenly spaced even if an upstream feed's idea of "current week"
 * rolls over at a different hour than ours.
 */
export function buildWeeks(seasonStartDate: string): RankingWeek[] {
  const anchor: Civil = backTo(civilFromISO(seasonStartDate), TUESDAY);
  const weeks: RankingWeek[] = [];
  for (let week = 1; week <= LAST_WEEK; week++) {
    const tuesday = addDays(anchor, (week - 1) * 7);
    weeks.push({
      week,
      tuesday,
      opensAt: etToInstant(tuesday, OPEN_HOUR),
      locksAt: etToInstant(addDays(tuesday, LOCK_DAY_OFFSET), LOCK_HOUR),
    });
  }
  return weeks;
}

/** The week currently accepting or showing votes. Clamped to the season. */
export function currentRankingWeek(weeks: RankingWeek[], now = new Date()): number {
  let current = 1;
  for (const w of weeks) {
    if (w.opensAt.getTime() <= now.getTime()) current = w.week;
  }
  return current;
}

export type WeekPhase = "upcoming" | "open" | "locked";

export function phaseOf(w: RankingWeek, now = new Date()): WeekPhase {
  const t = now.getTime();
  if (t < w.opensAt.getTime()) return "upcoming";
  if (t < w.locksAt.getTime()) return "open";
  return "locked";
}
