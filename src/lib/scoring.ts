import type { GameRow, PickRow } from "@/db/schema";
import type { Side } from "./espn";

export type Record = { wins: number; losses: number };

export type ConsensusLeg = {
  game: GameRow;
  /** The side the group is riding. */
  side: Side;
  homeVotes: number;
  awayVotes: number;
  totalVotes: number;
  /** True when the vote was deadlocked and the pre-drawn coin flip decided it. */
  decidedByCoinFlip: boolean;
  /** null until the game is final; 'push' legs void. */
  result: "win" | "loss" | "push" | null;
};

export type StandingRow = {
  rank: number;
  name: string;
  wins: number;
  losses: number;
  seasonWins: number;
  seasonLosses: number;
};

export function abbrFor(game: GameRow, side: Side): string {
  return side === "home" ? game.homeAbbr : game.awayAbbr;
}

/** A finished game grades picks; a push (tie) grades nobody. */
function gradable(game: GameRow): game is GameRow & { winner: Side } {
  return game.winner === "home" || game.winner === "away";
}

export function recordFor(games: GameRow[], picks: PickRow[]): Record {
  const byGame = new Map(picks.map((p) => [p.gameId, p.choice]));
  let wins = 0;
  let losses = 0;
  for (const game of games) {
    if (!gradable(game)) continue;
    const choice = byGame.get(game.id);
    if (!choice) continue;
    if (choice === game.winner) wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

/**
 * Weekly leaderboard, with season totals as the secondary column.
 * Equal weekly records share a rank (1, 2, 2, 4).
 */
export function buildStandings(
  userNames: readonly string[],
  weekGames: GameRow[],
  weekPicks: PickRow[],
  seasonGames: GameRow[],
  seasonPicks: PickRow[]
): StandingRow[] {
  const group = <T extends { userName: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.userName);
      if (list) list.push(row);
      else map.set(row.userName, [row]);
    }
    return map;
  };

  const weekBy = group(weekPicks);
  const seasonBy = group(seasonPicks);

  const rows = userNames.map((name) => {
    const week = recordFor(weekGames, weekBy.get(name) ?? []);
    const season = recordFor(seasonGames, seasonBy.get(name) ?? []);
    return {
      rank: 0,
      name,
      wins: week.wins,
      losses: week.losses,
      seasonWins: season.wins,
      seasonLosses: season.losses,
    };
  });

  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.seasonWins - a.seasonWins ||
      a.name.localeCompare(b.name)
  );

  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.wins === row.wins && prev.losses === row.losses ? prev.rank : i + 1;
  });

  return rows;
}

/**
 * The point of the whole exercise: one leg per game, taken from the group's
 * majority. A dead-even split falls to the coin flip that was drawn — and
 * shown to everyone — before voting opened.
 */
export function buildConsensus(games: GameRow[], picks: PickRow[]): ConsensusLeg[] {
  const tally = new Map<string, { home: number; away: number }>();
  for (const pick of picks) {
    const entry = tally.get(pick.gameId) ?? { home: 0, away: 0 };
    if (pick.choice === "home") entry.home += 1;
    else entry.away += 1;
    tally.set(pick.gameId, entry);
  }

  return games.map((game) => {
    const { home = 0, away = 0 } = tally.get(game.id) ?? {};
    const deadlocked = home === away;
    const side: Side = deadlocked
      ? (game.coinFlip as Side)
      : home > away
        ? "home"
        : "away";

    let result: ConsensusLeg["result"] = null;
    if (game.winner === "push") result = "push";
    else if (gradable(game)) result = side === game.winner ? "win" : "loss";

    return {
      game,
      side,
      homeVotes: home,
      awayVotes: away,
      totalVotes: home + away,
      // Only meaningful once somebody has voted; 0-0 isn't a real deadlock.
      decidedByCoinFlip: deadlocked && home + away > 0,
      result,
    };
  });
}

/** Vote split from the picking user's perspective, e.g. "9-3". */
export function splitLabel(leg: ConsensusLeg): string {
  return `${leg.awayVotes}-${leg.homeVotes}`;
}
