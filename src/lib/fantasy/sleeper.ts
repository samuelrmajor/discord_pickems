/**
 * Thin client over Sleeper's public read API. No key, no auth.
 *
 * Everything here slims its payload before returning: the raw responses carry
 * far more than we render (the active-player dump alone is ~11MB), and these
 * results get stored in Postgres and shipped to the browser.
 */

const BASE = "https://api.sleeper.app/v1";

type Json = Record<string, unknown>;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sleeper ${res.status} for ${path}`);
  return (await res.json()) as T;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type SleeperState = {
  season: number;
  week: number;
  seasonStartDate: string;
};

export async function fetchState(): Promise<SleeperState> {
  const d = await get<Json>("/state/nfl");
  return {
    season: Number(d.season ?? new Date().getFullYear()),
    week: Number(d.week ?? 1),
    seasonStartDate: String(d.season_start_date ?? `${d.season}-09-01`),
  };
}

export type SleeperLeague = {
  leagueId: string;
  name: string;
  season: string;
  avatar: string | null;
  totalRosters: number;
  playoffWeekStart: number;
  rosterPositions: string[];
  /** Last week Sleeper has finished scoring. 0 before the season starts. */
  lastScoredWeek: number;
};

export async function fetchLeague(leagueId: string): Promise<SleeperLeague> {
  const d = await get<Json>(`/league/${leagueId}`);
  const settings = (d.settings ?? {}) as Json;
  return {
    leagueId: String(d.league_id ?? leagueId),
    name: String(d.name ?? "League"),
    season: String(d.season ?? ""),
    avatar: str(d.avatar),
    totalRosters: Number(d.total_rosters ?? 0),
    playoffWeekStart: Number(settings.playoff_week_start ?? 15),
    rosterPositions: Array.isArray(d.roster_positions) ? (d.roster_positions as string[]) : [],
    lastScoredWeek: Number(settings.last_scored_leg ?? 0),
  };
}

export type SleeperUser = {
  userId: string;
  username: string;
  displayName: string | null;
  teamName: string | null;
  /** Ready-to-use image URL, or null. */
  avatarUrl: string | null;
};

/**
 * Sleeper exposes two avatars: an uploaded team image on `metadata.avatar`
 * (already a full URL) and the account avatar as a bare hash that has to be
 * expanded against the CDN. The team image wins when it exists.
 */
function avatarUrl(u: Json, meta: Json): string | null {
  const uploaded = str(meta.avatar);
  if (uploaded) return uploaded;
  const hash = str(u.avatar);
  return hash ? `https://sleepercdn.com/avatars/thumbs/${hash}` : null;
}

export async function fetchUsers(leagueId: string): Promise<SleeperUser[]> {
  const rows = await get<Json[]>(`/league/${leagueId}/users`);
  return rows.map((u) => {
    const meta = (u.metadata ?? {}) as Json;
    return {
      userId: String(u.user_id),
      username: String(u.display_name ?? u.user_id),
      displayName: str(u.display_name),
      teamName: str(meta.team_name),
      avatarUrl: avatarUrl(u, meta),
    };
  });
}

export type SleeperRoster = {
  rosterId: number;
  ownerId: string | null;
  players: string[];
  starters: string[];
  wins: number;
  losses: number;
  ties: number;
  /** Points scored, recombined from Sleeper's split whole/decimal fields. */
  pointsFor: number;
  pointsAgainst: number;
  /** Maximum possible points — what an optimal lineup would have scored. */
  potentialPoints: number;
};

/** Sleeper stores 159.66 as `{ fpts: 159, fpts_decimal: 66 }`. */
function points(settings: Json, key: string): number {
  return num(settings[key]) + num(settings[`${key}_decimal`]) / 100;
}

export async function fetchRosters(leagueId: string): Promise<SleeperRoster[]> {
  const rows = await get<Json[]>(`/league/${leagueId}/rosters`);
  return rows.map((r) => {
    const s = (r.settings ?? {}) as Json;
    return {
      rosterId: Number(r.roster_id),
      ownerId: str(r.owner_id),
      players: Array.isArray(r.players) ? (r.players as string[]) : [],
      starters: Array.isArray(r.starters) ? (r.starters as string[]) : [],
      wins: num(s.wins),
      losses: num(s.losses),
      ties: num(s.ties),
      pointsFor: points(s, "fpts"),
      pointsAgainst: points(s, "fpts_against"),
      potentialPoints: points(s, "ppts"),
    };
  });
}

export type SleeperMatchup = {
  rosterId: number;
  /** Null in a bye week; two rosters share a matchup id otherwise. */
  matchupId: number | null;
  points: number;
  starters: string[];
  startersPoints: number[];
};

export async function fetchMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  const rows = await get<Json[]>(`/league/${leagueId}/matchups/${week}`);
  return rows.map((m) => ({
    rosterId: Number(m.roster_id),
    matchupId: typeof m.matchup_id === "number" ? m.matchup_id : null,
    points: num(m.points),
    starters: Array.isArray(m.starters) ? (m.starters as string[]) : [],
    startersPoints: Array.isArray(m.starters_points) ? (m.starters_points as number[]) : [],
  }));
}

export type SleeperPlayer = {
  name: string;
  position: string;
  team: string | null;
  injury: string | null;
};

/** Only positions that can be rostered here; drops ~2/3 of the dump. */
const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

/**
 * The position to keep a player under, or null to drop them.
 *
 * `position` is the depth-chart listing, which isn't always the fantasy one:
 * Travis Hunter is a "DB" who is rostered as a WR. Falling back to
 * `fantasy_positions` keeps two-way and reclassified players resolvable.
 */
function fantasyPosition(p: Json): string | null {
  const listed = str(p.position);
  if (listed && FANTASY_POSITIONS.has(listed)) return listed;
  const alt = Array.isArray(p.fantasy_positions) ? (p.fantasy_positions as unknown[]) : [];
  for (const candidate of alt) {
    if (typeof candidate === "string" && FANTASY_POSITIONS.has(candidate)) return candidate;
  }
  return null;
}

/**
 * The active-player dump, slimmed to a name/position/team/injury map. The raw
 * response is ~11MB of scouting metadata; what survives is ~180KB, which is
 * small enough to keep in one jsonb row and hand to the client.
 */
export async function fetchPlayers(): Promise<Record<string, SleeperPlayer>> {
  const all = await get<Record<string, Json>>("/players/nfl?active=true");
  const out: Record<string, SleeperPlayer> = {};
  for (const [id, p] of Object.entries(all)) {
    const position = fantasyPosition(p);
    if (!position) continue;
    const name =
      str(p.full_name) ?? `${str(p.first_name) ?? ""} ${str(p.last_name) ?? ""}`.trim();
    if (!name) continue;
    out[id] = { name, position, team: str(p.team), injury: str(p.injury_status) };
  }
  return out;
}
