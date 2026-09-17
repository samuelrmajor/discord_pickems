/**
 * Pure transformation from Sleeper's payloads into the per-manager profiles the
 * UI renders. No I/O and no database, so it can be exercised directly against a
 * fixture or a live fetch.
 */
import type { UserName } from "../users";
import { MEMBERS, memberBySleeperId } from "./config";
import type {
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
  SleeperUser,
} from "./sleeper";

export type RosterLine = {
  id: string;
  name: string;
  position: string;
  team: string | null;
  injury: string | null;
  /** Points scored in the last scored week, when we have them. */
  points: number | null;
};

export type LastResult = {
  week: number;
  outcome: "W" | "L" | "T";
  points: number;
  opponent: string;
  opponentPoints: number;
};

export type Profile = {
  name: UserName;
  realName: string;
  /** team_name > display_name > username, per the league's own preference. */
  teamName: string;
  username: string;
  avatarUrl: string | null;
  seed: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  potentialPoints: number;
  streak: string | null;
  lastResult: LastResult | null;
  starters: RosterLine[];
  bench: RosterLine[];
};

export type LeagueSnapshot = {
  leagueName: string;
  season: number;
  nflWeek: number;
  seasonStartDate: string;
  lastScoredWeek: number;
  profiles: Profile[];
  builtAt: string;
};

function displayName(user: SleeperUser | undefined, fallback: string): string {
  return user?.teamName ?? user?.displayName ?? user?.username ?? fallback;
}

function lineFor(
  id: string,
  players: Record<string, SleeperPlayer>,
  points: number | null
): RosterLine {
  const p = players[id];
  return {
    id,
    name: p?.name ?? id,
    position: p?.position ?? "--",
    team: p?.team ?? null,
    injury: p?.injury ?? null,
    points,
  };
}

/**
 * Resolve one roster's result in the last scored week. Sleeper pairs rosters by
 * a shared `matchup_id`; a roster on bye has no partner and no result.
 */
function lastResultFor(
  rosterId: number,
  week: number,
  matchups: SleeperMatchup[],
  teamNameOf: (rosterId: number) => string
): LastResult | null {
  const mine = matchups.find((m) => m.rosterId === rosterId);
  if (!mine || mine.matchupId === null) return null;
  const theirs = matchups.find(
    (m) => m.matchupId === mine.matchupId && m.rosterId !== rosterId
  );
  if (!theirs) return null;

  return {
    week,
    outcome: mine.points > theirs.points ? "W" : mine.points < theirs.points ? "L" : "T",
    points: mine.points,
    opponent: teamNameOf(theirs.rosterId),
    opponentPoints: theirs.points,
  };
}

export function buildProfiles(
  users: SleeperUser[],
  rosters: SleeperRoster[],
  players: Record<string, SleeperPlayer>,
  matchups: SleeperMatchup[],
  lastScoredWeek: number
): Profile[] {
  const userById = new Map(users.map((u) => [u.userId, u]));
  const rosterByOwner = new Map(
    rosters.flatMap((r) => (r.ownerId ? [[r.ownerId, r] as const] : []))
  );

  const teamNameOf = (rosterId: number): string => {
    const roster = rosters.find((r) => r.rosterId === rosterId);
    const user = roster?.ownerId ? userById.get(roster.ownerId) : undefined;
    const member = roster?.ownerId ? memberBySleeperId(roster.ownerId) : undefined;
    return displayName(user, member?.realName ?? `Roster ${rosterId}`);
  };

  // Standings order, used only to stamp each profile with its current seed.
  const seeds = new Map<number, number>();
  [...rosters]
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
    .forEach((r, i) => seeds.set(r.rosterId, i + 1));

  return MEMBERS.map((member) => {
    const user = userById.get(member.sleeperUserId);
    const roster = rosterByOwner.get(member.sleeperUserId);

    const weekPoints = new Map<string, number>();
    if (roster) {
      const mine = matchups.find((m) => m.rosterId === roster.rosterId);
      mine?.starters.forEach((id, i) => weekPoints.set(id, mine.startersPoints[i] ?? 0));
    }

    const starters = (roster?.starters ?? [])
      .filter((id) => id && id !== "0")
      .map((id) => lineFor(id, players, weekPoints.get(id) ?? null));
    const starterIds = new Set(roster?.starters ?? []);
    const bench = (roster?.players ?? [])
      .filter((id) => !starterIds.has(id))
      .map((id) => lineFor(id, players, null))
      .sort((a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name));

    return {
      name: member.name,
      realName: member.realName,
      teamName: displayName(user, member.realName),
      username: user?.username ?? member.realName,
      avatarUrl: user?.avatarUrl ?? null,
      seed: roster ? (seeds.get(roster.rosterId) ?? 0) : 0,
      wins: roster?.wins ?? 0,
      losses: roster?.losses ?? 0,
      ties: roster?.ties ?? 0,
      pointsFor: roster?.pointsFor ?? 0,
      pointsAgainst: roster?.pointsAgainst ?? 0,
      potentialPoints: roster?.potentialPoints ?? 0,
      streak: roster?.streak ?? null,
      lastResult:
        roster && lastScoredWeek > 0
          ? lastResultFor(roster.rosterId, lastScoredWeek, matchups, teamNameOf)
          : null,
      starters,
      bench,
    };
  });
}
