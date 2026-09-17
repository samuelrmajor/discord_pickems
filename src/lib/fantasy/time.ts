/**
 * Eastern-time helpers.
 *
 * The ranking week opens Tuesday 1:00am ET and locks Thursday 5:00pm ET. Those
 * are wall-clock times, so they must survive the November DST change: a week
 * window is not "the previous one plus 7 * 24h", it is the same clock reading
 * on a date seven days later. Everything here therefore works in civil dates
 * and converts to an instant only at the end.
 */

const ET = "America/New_York";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** A date on the calendar, with no time zone attached. */
export type Civil = { y: number; m: number; d: number };

function readParts(at: Date) {
  const out: Record<string, number> = {};
  for (const p of PARTS.formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

/** How far ET is from UTC at this instant, in ms (negative — ET is behind). */
function offsetAt(at: Date): number {
  const p = readParts(at);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at.getTime();
}

/** The instant at which ET clocks read the given wall-clock date and time. */
export function etToInstant(date: Civil, hour: number, minute = 0): Date {
  const wall = Date.UTC(date.y, date.m - 1, date.d, hour, minute);
  // Guess with the offset at the naive instant, then correct once using the
  // offset that actually applies there. Two passes settle every real case; the
  // only inputs that wouldn't are wall-clock times inside a DST gap, and 1am /
  // 5pm are never in one (the US gap is 2:00–3:00am).
  const guess = new Date(wall - offsetAt(new Date(wall)));
  return new Date(wall - offsetAt(guess));
}

export function civilFromISO(iso: string): Civil {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** Civil date arithmetic, done at noon UTC so no DST shift can round it off. */
export function addDays(date: Civil, days: number): Civil {
  const at = new Date(Date.UTC(date.y, date.m - 1, date.d, 12) + days * 86_400_000);
  return { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate() };
}

/** 0 = Sunday. */
export function dayOfWeek(date: Civil): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d, 12)).getUTCDay();
}

/** The given weekday on or before `date`. */
export function backTo(date: Civil, weekday: number): Civil {
  return addDays(date, -((dayOfWeek(date) - weekday + 7) % 7));
}

/** "Thu 5:00 PM" for a deadline, in ET, since that is how the league thinks. */
export function formatET(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}
