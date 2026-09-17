import { redirect } from "next/navigation";
import Bootstrapping from "@/components/fantasy/Bootstrapping";
import FantasyShell from "@/components/fantasy/FantasyShell";
import { MEMBER_NAMES } from "@/lib/fantasy/config";
import { consensusForWeek, getStartingOrder, getWeekBallots } from "@/lib/fantasy/ballots";
import { buildConsensus } from "@/lib/fantasy/rankings";
import { readCards, snapshotIsStale } from "@/lib/fantasy/snapshot";
import { buildWeeks, currentRankingWeek, phaseOf } from "@/lib/fantasy/week";
import { ensureUsersSeeded } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ week?: string }> };

export default async function FantasyPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await ensureUsersSeeded();

  // The season's week windows are derived from Sleeper's season start date, so
  // without a snapshot there is no week to render at all — hold the loading
  // screen until the first ingest lands.
  const league = await readCards();
  if (!league) return <Bootstrapping />;
  const snapshot = league.snapshot;

  const weeks = buildWeeks(snapshot.seasonStartDate);
  const current = currentRankingWeek(weeks);

  const requested = Number((await searchParams).week);
  // Future weeks aren't viewable: nobody has voted and the board would be empty.
  const week =
    Number.isInteger(requested) && requested >= 1 && requested <= current
      ? requested
      : current;

  const target = weeks[week - 1];
  const phase = phaseOf(target);
  const revealed = phase === "locked";

  const [ballots, mine, previous] = await Promise.all([
    getWeekBallots(snapshot.season, week),
    getStartingOrder(snapshot.season, week, user),
    consensusForWeek(snapshot.season, week - 1),
  ]);

  const byVoter = new Map(ballots.map((b) => [b.voter, b]));
  const submissions = MEMBER_NAMES.map((name) => {
    const ballot = byVoter.get(name);
    return {
      name,
      started: Boolean(ballot),
      lockedIn: ballot?.lockedIn ?? false,
    };
  });

  return (
    <FantasyShell
      week={week}
      currentWeek={current}
      phase={phase}
      opensAt={target.opensAt.toISOString()}
      locksAt={target.locksAt.toISOString()}
      cards={league.cards}
      rosterVersion={league.rosterVersion}
      myOrder={mine.order}
      myLockedIn={mine.lockedIn}
      carriedFromWeek={mine.carriedFromWeek}
      canVote={MEMBER_NAMES.includes(user as never)}
      submissions={submissions}
      consensus={revealed ? buildConsensus(ballots, previous ?? undefined) : null}
      ballotCount={ballots.length}
      stale={await snapshotIsStale()}
    />
  );
}
