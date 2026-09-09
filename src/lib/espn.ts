/**
 * Thin client over ESPN's public (unofficial) NFL scoreboard API.
 * No key required. One endpoint gives us schedule, odds, live scores and winners.
 */

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export type Side = "home" | "away";
export type GameStatus = "scheduled" | "in_progress" | "final";

export type EspnGame = {
  id: string;
  season: number;
  week: number;
  kickoffAt: Date;
  shortName: string;
  homeAbbr: string;
  homeName: string;
  homeLogo: string | null;
  awayAbbr: string;
  awayName: string;
  awayLogo: string | null;
  /** Favored side per DraftKings, or null when no line is published. */
  favorite: Side | null;
  /** Absolute point spread, e.g. 3.5. Null when no line. */
  spread: number | null;
  status: GameStatus;
  statusDetail: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: Side | "push" | null;
};

export type WeekMeta = { week: number; startDate: Date; endDate: Date };

type Json = Record<string, unknown>;

async function fetchJson(url: string): Promise<Json> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return (await res.json()) as Json;
}

function statusFrom(name: string): GameStatus {
  if (name === "STATUS_FINAL") return "final";
  if (name === "STATUS_SCHEDULED" || name === "STATUS_POSTPONED") return "scheduled";
  return "in_progress";
}

/**
 * ESPN's odds `details` reads like "SEA -3" or "EVEN". Map the abbreviation
 * back to a side so we never depend on sign conventions we don't control.
 */
function favoriteFrom(
  odds: Json | undefined,
  homeAbbr: string,
  awayAbbr: string
): { favorite: Side | null; spread: number | null } {
  if (!odds) return { favorite: null, spread: null };
  const details = typeof odds.details === "string" ? odds.details.trim() : "";
  const match = details.match(/^([A-Z]{2,4})\s+(-?\d+(?:\.\d+)?)$/);
  if (match) {
    const [, abbr, num] = match;
    const side: Side | null =
      abbr === homeAbbr ? "home" : abbr === awayAbbr ? "away" : null;
    if (side) return { favorite: side, spread: Math.abs(Number(num)) };
  }
  // Fall back to the numeric spread, which ESPN quotes from the home side.
  const raw = typeof odds.spread === "number" ? odds.spread : null;
  if (raw !== null && raw !== 0) {
    return { favorite: raw < 0 ? "home" : "away", spread: Math.abs(raw) };
  }
  return { favorite: null, spread: null };
}

function normalizeEvent(event: Json, season: number, week: number): EspnGame | null {
  const comp = (event.competitions as Json[] | undefined)?.[0];
  if (!comp) return null;

  const competitors = (comp.competitors as Json[] | undefined) ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const team = (c: Json) => (c.team ?? {}) as Json;
  const logo = (c: Json) => {
    const l = team(c).logo;
    return typeof l === "string" ? l : null;
  };
  const score = (c: Json) => {
    const n = Number(c.score);
    return Number.isFinite(n) ? n : null;
  };

  const homeAbbr = String(team(home).abbreviation ?? "");
  const awayAbbr = String(team(away).abbreviation ?? "");

  const statusType = ((comp.status as Json)?.type ?? {}) as Json;
  const status = statusFrom(String(statusType.name ?? "STATUS_SCHEDULED"));

  let winner: Side | "push" | null = null;
  if (status === "final") {
    if (home.winner === true) winner = "home";
    else if (away.winner === true) winner = "away";
    else winner = "push";
  }

  const { favorite, spread } = favoriteFrom(
    (comp.odds as Json[] | undefined)?.[0],
    homeAbbr,
    awayAbbr
  );

  return {
    id: String(event.id),
    season,
    week,
    kickoffAt: new Date(String(event.date)),
    shortName: String(event.shortName ?? `${awayAbbr} @ ${homeAbbr}`),
    homeAbbr,
    homeName: String(team(home).displayName ?? homeAbbr),
    homeLogo: logo(home),
    awayAbbr,
    awayName: String(team(away).displayName ?? awayAbbr),
    awayLogo: logo(away),
    favorite,
    spread,
    status,
    statusDetail: String(statusType.shortDetail ?? ""),
    homeScore: score(home),
    awayScore: score(away),
    winner,
  };
}

/** Regular-season games for one week. */
export async function fetchWeek(season: number, week: number): Promise<EspnGame[]> {
  const data = await fetchJson(`${BASE}?dates=${season}&seasontype=2&week=${week}`);
  const events = (data.events as Json[] | undefined) ?? [];
  return events
    .map((e) => normalizeEvent(e, season, week))
    .filter((g): g is EspnGame => g !== null)
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
}

export type SeasonCalendar = {
  season: number;
  currentWeek: number;
  weeks: WeekMeta[];
};

/**
 * The live scoreboard tells us which season/week the NFL considers "now", plus
 * every regular-season week's boundaries. ESPN rolls the week over on Wednesday
 * ~3am ET, which is exactly the reset we want.
 */
export async function fetchCalendar(): Promise<SeasonCalendar> {
  const data = await fetchJson(BASE);
  const league = ((data.leagues as Json[] | undefined)?.[0] ?? {}) as Json;
  const season = Number((data.season as Json | undefined)?.year ?? new Date().getFullYear());
  const currentWeek = Number((data.week as Json | undefined)?.number ?? 1);

  const calendar = (league.calendar as Json[] | undefined) ?? [];
  const regular = calendar.find((c) => String(c.value) === "2");
  const entries = (regular?.entries as Json[] | undefined) ?? [];

  const weeks: WeekMeta[] = entries.map((e) => ({
    week: Number(e.value),
    startDate: new Date(String(e.startDate)),
    endDate: new Date(String(e.endDate)),
  }));

  // Prefer the calendar window containing "now" — it is the authority on the
  // Wednesday rollover; `data.week` can lag during the postseason boundary.
  const now = Date.now();
  const containing = weeks.find(
    (w) => now >= w.startDate.getTime() && now <= w.endDate.getTime()
  );

  return {
    season,
    currentWeek: containing?.week ?? currentWeek,
    weeks: weeks.length ? weeks : [{ week: currentWeek, startDate: new Date(0), endDate: new Date(0) }],
  };
}
