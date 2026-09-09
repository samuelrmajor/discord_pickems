/**
 * One-time setup: create the twelve members and pull in the season schedule.
 * Run with: npm run db:seed
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { ensureUsersSeeded } = await import("../src/lib/queries");
  const { fetchCalendar } = await import("../src/lib/espn");
  const { syncWeek } = await import("../src/lib/sync");

  await ensureUsersSeeded();
  console.log("Seeded 12 members.");

  const calendar = await fetchCalendar();
  const weeksArg = process.argv[2];
  const weeks = weeksArg
    ? weeksArg.split(",").map(Number)
    : calendar.weeks.map((w) => w.week);

  for (const week of weeks) {
    const count = await syncWeek(calendar.season, week);
    console.log(`Week ${String(week).padStart(2)}: ${count} games`);
  }

  console.log(`\nDone. Season ${calendar.season}, current week ${calendar.currentWeek}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
