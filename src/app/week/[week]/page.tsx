import { notFound, redirect } from "next/navigation";
import PicksBoard from "@/components/PicksBoard";
import ResultsPanel from "@/components/ResultsPanel";
import ParlayPanel from "@/components/ParlayPanel";
import WeekShell, { type TabKey } from "@/components/WeekShell";
import { fetchCalendar, type Side } from "@/lib/espn";
import {
  ensureUsersSeeded,
  getSeasonGames,
  getSeasonPicks,
  getWeekGames,
  getWeekPicks,
} from "@/lib/queries";
import { buildConsensus, buildStandings } from "@/lib/scoring";
import { getCurrentUser } from "@/lib/session";
import { ensureWeekFresh } from "@/lib/sync";
import { USERS } from "@/lib/users";
import { toGameVM, toLegVM } from "@/lib/view";

// Always render fresh: scores and other people's picks change under us.
export const dynamic = "force-dynamic";

export default async function WeekPage({ params }: { params: Promise<{ week: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const week = Number((await params).week);
  if (!Number.isInteger(week) || week < 1 || week > 18) notFound();

  const calendar = await fetchCalendar();
  const season = calendar.season;

  await ensureUsersSeeded();
  await ensureWeekFresh(season, week);

  const weekGames = await getWeekGames(season, week);
  const weekPicks = await getWeekPicks(weekGames);
  const seasonGames = await getSeasonGames(season);
  const seasonPicks = await getSeasonPicks(seasonGames);

  // Vote tallies per game, used for both the locked-card split and the parlay.
  const tally = new Map<string, { home: number; away: number }>();
  for (const pick of weekPicks) {
    const entry = tally.get(pick.gameId) ?? { home: 0, away: 0 };
    if (pick.choice === "home") entry.home += 1;
    else entry.away += 1;
    tally.set(pick.gameId, entry);
  }

  const gameVMs = weekGames.map((game) => {
    const votes = tally.get(game.id) ?? { home: 0, away: 0 };
    return toGameVM(game, { homeVotes: votes.home, awayVotes: votes.away });
  });

  const myPicks: Record<string, Side> = {};
  for (const pick of weekPicks) {
    if (pick.userName === user) myPicks[pick.gameId] = pick.choice as Side;
  }

  const standings = buildStandings(USERS, weekGames, weekPicks, seasonGames, seasonPicks);
  const legs = buildConsensus(weekGames, weekPicks).map(toLegVM);

  const gradedCount = weekGames.filter((g) => g.winner !== null).length;
  const pickedCount = gameVMs.filter((g) => myPicks[g.id]).length;

  /**
   * Which screen opens first, decided from real game state rather than the
   * calendar day. Any game still open that you haven't picked means you have
   * work to do; otherwise you came here to see how it's going.
   *
   * This gives the requested Monday/Tuesday and Wednesday behavior for free:
   * by Monday every game is locked, so you land on Results; on Wednesday ESPN
   * rolls the week over to a fresh, unpicked slate, so you land on Picks.
   */
  const hasOpenUnpicked = gameVMs.some((g) => !g.locked && !myPicks[g.id]);
  const defaultTab: TabKey = hasOpenUnpicked || gameVMs.length === 0 ? "picks" : "results";

  return (
    <WeekShell
      user={user}
      week={week}
      weeks={calendar.weeks.map((w) => w.week)}
      currentWeek={calendar.currentWeek}
      defaultTab={defaultTab}
      pickedCount={pickedCount}
      gameCount={gameVMs.length}
      picks={
        <PicksBoard season={season} week={week} games={gameVMs} initialPicks={myPicks} />
      }
      results={
        <ResultsPanel
          week={week}
          currentUser={user}
          standings={standings}
          games={gameVMs}
          myPicks={myPicks}
          gradedCount={gradedCount}
        />
      }
      parlay={<ParlayPanel week={week} legs={legs} memberCount={USERS.length} />}
    />
  );
}
