/**
 * The power-ranking rules: what a valid ballot is, and how a set of ballots
 * becomes one consensus board. Pure functions — storage lives in `ballots`.
 */
import { MEMBER_NAMES } from "./config";

export type Ballot = {
  voter: string;
  order: string[];
  lockedIn: boolean;
  updatedAt: Date;
};

/**
 * Coerce a stored or submitted order into a valid, complete ballot.
 *
 * Anything unrecognised is dropped and anyone missing is appended in league
 * order, so a ballot saved before a roster change still opens as a usable
 * twelve-name list instead of erroring or silently losing a member.
 */
export function normalizeOrder(order: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of order) {
    if (MEMBER_NAMES.includes(name as never) && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  for (const name of MEMBER_NAMES) if (!seen.has(name)) out.push(name);
  return out;
}

// ---------------------------------------------------------------- results

export type ConsensusRow = {
  name: string;
  /** Mean position across every ballot cast, 1 = best. */
  average: number;
  best: number;
  worst: number;
  /** Position in the consensus, after sorting by average. */
  rank: number;
  /** Change vs. the previous week's consensus; null when there isn't one. */
  delta: number | null;
};

/**
 * Fold ballots into a consensus. Ballots are averaged rather than tallied by
 * first-place votes so that a member everyone ranks 4th beats one who is split
 * between 1st and 12th — which is what a power ranking is meant to express.
 */
export function buildConsensus(
  weekBallots: Ballot[],
  previous?: ConsensusRow[]
): ConsensusRow[] {
  const priorRank = new Map((previous ?? []).map((r) => [r.name, r.rank]));

  const rows = MEMBER_NAMES.map((name) => {
    const positions = weekBallots
      .map((b) => b.order.indexOf(name) + 1)
      .filter((p) => p > 0);

    if (positions.length === 0) {
      return { name, average: 0, best: 0, worst: 0, rank: 0, delta: null };
    }
    const sum = positions.reduce((a, b) => a + b, 0);
    return {
      name,
      average: sum / positions.length,
      best: Math.min(...positions),
      worst: Math.max(...positions),
      rank: 0,
      delta: null as number | null,
    };
  });

  if (weekBallots.length === 0) return rows;

  rows.sort((a, b) => a.average - b.average || a.best - b.best);
  rows.forEach((row, i) => {
    row.rank = i + 1;
    const before = priorRank.get(row.name);
    // A positive delta means "moved up the board", i.e. toward rank 1.
    row.delta = before ? before - row.rank : null;
  });
  return rows;
}
