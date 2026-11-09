/**
 * The ESPN feeds the anytime-touchdown module reads. All public, no key.
 *
 *  - Team rosters, for the player search. Their athlete ids are the same ids
 *    the prop feed and the box score use, so nothing has to be matched by name.
 *  - The DraftKings prop list ESPN republishes, for whether a player has an
 *    anytime-TD line at all. ESPN strips the prices from these, so this answers
 *    "can this leg be bet?" and nothing more — prices come from `odds-api`.
 *  - The game summary's box score, for who scored.
 */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

/** ESPN's id for DraftKings, the book the group bets with. */
const DRAFTKINGS = "100";
/** ESPN's prop type id for "Anytime Touchdown Scorer". */
const ANYTIME_TD = "31";

/** The positions worth offering. Linemen and kickers don't score on purpose. */
const SKILL = new Set(["QB", "RB", "FB", "WR", "TE"]);

type Json = Record<string, unknown>;

async function fetchJson(url: string): Promise<Json> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return (await res.json()) as Json;
}

export type RosterPlayer = {
  id: string;
  name: string;
  pos: string;
  team: string;
  jersey: string | null;
  /** "Out", "Questionable", ... — null when healthy. */
  injury: string | null;
};

/**
 * A team's offensive skill players, slimmed. The raw roster is ~400KB and
 * carries the defense, the practice squad and a bio for everyone.
 *
 * Injured reserve is kept rather than dropped: someone searching for a star
 * who just went on IR should find him marked out, not be told he doesn't exist.
 */
export async function fetchRoster(teamAbbr: string): Promise<RosterPlayer[]> {
  const data = await fetchJson(`${SITE}/teams/${teamAbbr.toLowerCase()}/roster`);
  const groups = (data.athletes as Json[] | undefined) ?? [];
  const out: RosterPlayer[] = [];

  for (const group of groups) {
    if (group.position !== "offense" && group.position !== "injuredReserveOrOut") continue;
    for (const a of (group.items as Json[] | undefined) ?? []) {
      const pos = String(((a.position as Json | undefined)?.abbreviation as string) ?? "");
      if (!SKILL.has(pos)) continue;
      const injuries = (a.injuries as Json[] | undefined) ?? [];
      const injury =
        group.position === "injuredReserveOrOut"
          ? "Out"
          : typeof injuries[0]?.status === "string"
            ? (injuries[0].status as string)
            : null;
      out.push({
        id: String(a.id),
        name: String(a.displayName ?? a.fullName ?? ""),
        pos,
        team: teamAbbr,
        jersey: typeof a.jersey === "string" ? a.jersey : null,
        injury,
      });
    }
  }
  return out;
}

/**
 * The athletes DraftKings has an anytime-TD market up for in one game.
 *
 * The prop list is every market for the game (~1,900 rows), paged, and the
 * endpoint ignores a type filter, so it is read whole and filtered here.
 */
export async function fetchAnytimeLines(gameId: string): Promise<string[]> {
  const base =
    `${CORE}/events/${gameId}/competitions/${gameId}/odds/${DRAFTKINGS}/propBets` +
    `?lang=en&region=us&limit=1000`;

  const first = await fetchJson(base);
  const pages = Number(first.pageCount ?? 1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => fetchJson(`${base}&page=${i + 2}`))
  );

  const ids = new Set<string>();
  for (const page of [first, ...rest]) {
    for (const item of (page.items as Json[] | undefined) ?? []) {
      if ((item.type as Json | undefined)?.id !== ANYTIME_TD) continue;
      const ref = String((item.athlete as Json | undefined)?.$ref ?? "");
      const id = ref.match(/athletes\/(\d+)/)?.[1];
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** The box-score columns that are a touchdown for an anytime-TD bet. */
const TD_KEYS = new Set([
  "rushingTouchdowns",
  "receivingTouchdowns",
  "defensiveTouchdowns",
  "interceptionTouchdowns",
  "kickReturnTouchdowns",
  "puntReturnTouchdowns",
]);

export type BoxScore = {
  /** Athletes with at least one touchdown that counts. Passing TDs don't. */
  scorers: string[];
  /** Everyone who recorded any stat — used to tell "didn't score" from "didn't play". */
  appeared: string[];
  /**
   * Touchdowns per scorer. Optional because box scores cached before it was
   * added don't carry it; a scorer missing from it has at least one.
   */
  counts?: Record<string, number>;
};

export async function fetchBoxScore(gameId: string): Promise<BoxScore> {
  const data = await fetchJson(`${SITE}/summary?event=${gameId}`);
  const teams = ((data.boxscore as Json | undefined)?.players as Json[] | undefined) ?? [];

  const counts: Record<string, number> = {};
  const appeared = new Set<string>();

  for (const team of teams) {
    for (const stat of (team.statistics as Json[] | undefined) ?? []) {
      const keys = (stat.keys as string[] | undefined) ?? [];
      const tdColumns = keys.flatMap((k, i) => (TD_KEYS.has(k) ? [i] : []));
      for (const row of (stat.athletes as Json[] | undefined) ?? []) {
        const id = String((row.athlete as Json | undefined)?.id ?? "");
        if (!id) continue;
        appeared.add(id);
        const values = (row.stats as string[] | undefined) ?? [];
        // One athlete shows up under several categories (rushing, receiving,
        // returns), so his touchdowns are summed across all of them.
        for (const i of tdColumns) {
          const n = Number(values[i]);
          if (n > 0) counts[id] = (counts[id] ?? 0) + n;
        }
      }
    }
  }
  return { scorers: Object.keys(counts), appeared: [...appeared], counts };
}
