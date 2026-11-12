import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TdShell from "@/components/td/TdShell";
import { fetchCalendar } from "@/lib/espn";
import { canSeeModule } from "@/lib/modules";
import { ensureUsersSeeded, getWeekGames } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { ensureWeekFresh } from "@/lib/sync";
import { loadTdWeek } from "@/lib/td/data";
import { getWeekTdPicks } from "@/lib/td/picks";
import { USERS } from "@/lib/users";

export const dynamic = "force-dynamic";

const SITE_NAME = "FWL Fantasy";
const TITLE = "Anytime TD";
const DESCRIPTION = "Everyone picks one anytime touchdown scorer; twelve legs, a dollar each.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // A page-level `openGraph` replaces the layout's outright, so restate it.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: "/touchdowns",
  },
};

/** Everyone puts in a dollar. */
const STAKE_PER_MEMBER = 1;

type Props = { searchParams: Promise<{ week?: string }> };

export default async function TouchdownsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/touchdowns");
  if (!canSeeModule(user, "touchdowns")) redirect("/");

  // Independent of each other, so neither waits on the other.
  const [calendar] = await Promise.all([fetchCalendar(), ensureUsersSeeded()]);
  const season = calendar.season;
  const weeks = calendar.weeks.map((w) => w.week);

  const requested = Number((await searchParams).week);
  const week = weeks.includes(requested) ? requested : calendar.currentWeek;

  // Kickoffs and live status come from the Pick'em games table, kept fresh the
  // same way; this module only adds players, props and box scores on top.
  await ensureWeekFresh(season, week);

  const [weekGames, picks] = await Promise.all([
    getWeekGames(season, week),
    getWeekTdPicks(season, week),
  ]);
  const data = await loadTdWeek(season, weekGames, picks);

  return (
    <TdShell
      user={user}
      week={week}
      weeks={weeks}
      currentWeek={calendar.currentWeek}
      members={[...USERS]}
      stake={STAKE_PER_MEMBER * USERS.length}
      {...data}
    />
  );
}
