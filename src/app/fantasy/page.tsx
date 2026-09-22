import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Bootstrapping from "@/components/fantasy/Bootstrapping";
import FantasyShell from "@/components/fantasy/FantasyShell";
import { MEMBER_NAMES } from "@/lib/fantasy/config";
import { isLeagueAdmin } from "@/lib/fantasy/admin";
import { consensusForWeek, getStartingOrder, getWeekBallots } from "@/lib/fantasy/ballots";
import { getLock } from "@/lib/fantasy/lock";
import { buildConsensus } from "@/lib/fantasy/rankings";
import { readCards, snapshotIsStale } from "@/lib/fantasy/snapshot";
import { buildWeeks, currentRankingWeek, phaseOf } from "@/lib/fantasy/week";
import { canSeeModule } from "@/lib/modules";
import { ensureUsersSeeded } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const SITE_NAME = "FWL Fantasy";
const TITLE = "Coach's Poll";
const DESCRIPTION = "Rank the fantasy league each week; results open when Pat closes voting.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // A page-level `openGraph` replaces the layout's outright rather than
  // merging into it, so the shared fields are restated here.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: "/fantasy",
  },
};

type Props = { searchParams: Promise<{ week?: string }> };

export default async function FantasyPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  // Carry the destination so a tap on the Discord link lands here after signing
  // in — and so the unfurl crawler, which is always signed out, is redirected
  // to a login page that still describes this module.
  if (!user) redirect("/login?next=/fantasy");
  if (!canSeeModule(user, "fantasy")) redirect("/");

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

  const [lock, ballots, mine, previous] = await Promise.all([
    getLock(snapshot.season, week),
    getWeekBallots(snapshot.season, week),
    getStartingOrder(snapshot.season, week, user),
    consensusForWeek(snapshot.season, week - 1),
  ]);

  // Nothing here is on a clock any more: the week is open until Pat closes it,
  // and closing it is what reveals everyone's ballots.
  const phase = phaseOf(target, lock !== null);
  const revealed = phase === "locked";

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
      lockedAt={lock ? lock.lockedAt.toISOString() : null}
      cards={league.cards}
      rosterVersion={league.rosterVersion}
      myOrder={mine.order}
      myLockedIn={mine.lockedIn}
      carriedFromWeek={mine.carriedFromWeek}
      canVote={MEMBER_NAMES.includes(user as never)}
      isAdmin={isLeagueAdmin(user)}
      submissions={submissions}
      consensus={revealed ? buildConsensus(ballots, previous ?? undefined) : null}
      ballotCount={ballots.length}
      stale={await snapshotIsStale()}
    />
  );
}
