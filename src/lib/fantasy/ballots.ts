/** Ballot storage. The rules that turn ballots into a ranking live in `rankings`. */
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { ballots, type BallotRow } from "@/db/schema";
import { MEMBER_NAMES } from "./config";
import { buildConsensus, normalizeOrder, type Ballot, type ConsensusRow } from "./rankings";

function toBallot(row: BallotRow): Ballot {
  return {
    voter: row.voter,
    order: normalizeOrder(row.order),
    lockedIn: row.lockedIn,
    updatedAt: row.updatedAt,
  };
}

export async function getWeekBallots(season: number, week: number): Promise<Ballot[]> {
  const rows = await db
    .select()
    .from(ballots)
    .where(and(eq(ballots.season, season), eq(ballots.week, week)));
  return rows.map(toBallot);
}

/**
 * The ordering a voter should start this week from: their own ballot if they
 * have already touched this week, else their most recent previous ballot, else
 * the league's default order.
 */
export async function getStartingOrder(
  season: number,
  week: number,
  voter: string
): Promise<{ order: string[]; lockedIn: boolean; carriedFromWeek: number | null }> {
  const [own] = await db
    .select()
    .from(ballots)
    .where(
      and(eq(ballots.season, season), eq(ballots.week, week), eq(ballots.voter, voter))
    );
  if (own) return { order: normalizeOrder(own.order), lockedIn: own.lockedIn, carriedFromWeek: null };

  const [prior] = await db
    .select()
    .from(ballots)
    .where(and(eq(ballots.season, season), eq(ballots.voter, voter), lt(ballots.week, week)))
    .orderBy(desc(ballots.week))
    .limit(1);

  if (prior) {
    return {
      order: normalizeOrder(prior.order),
      lockedIn: false,
      carriedFromWeek: prior.week,
    };
  }
  return { order: [...MEMBER_NAMES], lockedIn: false, carriedFromWeek: null };
}

export async function saveBallot(
  season: number,
  week: number,
  voter: string,
  order: readonly string[],
  lockedIn: boolean
): Promise<void> {
  const normalized = normalizeOrder(order);
  const updatedAt = new Date();
  await db
    .insert(ballots)
    .values({ season, week, voter, order: normalized, lockedIn, updatedAt })
    .onConflictDoUpdate({
      target: [ballots.season, ballots.week, ballots.voter],
      set: { order: normalized, lockedIn, updatedAt },
    });
}

/** The consensus for a week, or null if nobody voted. Used for week-over-week deltas. */
export async function consensusForWeek(
  season: number,
  week: number
): Promise<ConsensusRow[] | null> {
  if (week < 1) return null;
  const rows = await getWeekBallots(season, week);
  return rows.length ? buildConsensus(rows) : null;
}
