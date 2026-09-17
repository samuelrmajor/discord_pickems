import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { fantasyCache } from "@/db/schema";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { DiscordNotConfigured, postToDiscord } from "@/lib/discord";
import { consensusForWeek, getWeekBallots } from "@/lib/fantasy/ballots";
import { discordNameFor } from "@/lib/fantasy/config";
import { buildConsensus, type ConsensusRow } from "@/lib/fantasy/rankings";
import { readSnapshot, type ProfileCard } from "@/lib/fantasy/snapshot";
import { buildWeeks, currentRankingWeek, phaseOf } from "@/lib/fantasy/week";

export const dynamic = "force-dynamic";

/** Discord embed accent, matching the app's green. */
const ACCENT = 0x3ddc84;

/**
 * Claim the right to post this week, atomically.
 *
 * The schedule fires more than once (see the workflow — UTC cron can't follow
 * US daylight saving, so both candidate hours run and the loser no-ops). An
 * insert that conflicts returns no rows, so exactly one caller ever wins.
 */
async function claim(key: string): Promise<boolean> {
  const claimed = await db
    .insert(fantasyCache)
    .values({ key, payload: { postedAt: new Date().toISOString() } })
    .onConflictDoNothing()
    .returning({ key: fantasyCache.key });
  return claimed.length > 0;
}

async function release(key: string): Promise<void> {
  await db.delete(fantasyCache).where(eq(fantasyCache.key, key));
}

function movement(delta: number | null): string {
  if (delta === null) return "  ";
  if (delta === 0) return " -";
  return delta > 0 ? `+${Math.min(delta, 9)}` : `-${Math.min(-delta, 9)}`;
}

function board(rows: ConsensusRow[], cards: Map<string, ProfileCard>): string {
  const lines = rows.map((row) => {
    const card = cards.get(row.name);
    const name = (card?.teamName ?? row.name).slice(0, 20).padEnd(20);
    const rank = String(row.rank).padStart(2);
    return `${rank}  ${movement(row.delta)}  ${name} ${row.average.toFixed(2).padStart(5)}`;
  });
  return ["```", " #   Δ   Team                   Avg", ...lines, "```"].join("\n");
}

/**
 * Post the week's power rankings to Discord once voting has locked.
 *
 * Deliberately defensive about *when* it runs: the schedule is approximate, so
 * this re-derives the week and its phase and simply does nothing if the board
 * is not actually final yet.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await readSnapshot();
  if (!snapshot) return NextResponse.json({ skipped: "no league snapshot yet" });

  const weeks = buildWeeks(snapshot.seasonStartDate);
  const week = currentRankingWeek(weeks);
  if (phaseOf(weeks[week - 1]) !== "locked") {
    return NextResponse.json({ skipped: "voting is still open", week });
  }

  const ballots = await getWeekBallots(snapshot.season, week);
  if (ballots.length === 0) {
    return NextResponse.json({ skipped: "nobody voted", week });
  }

  const key = `posted:rankings:${snapshot.season}:${week}`;
  if (!(await claim(key))) {
    return NextResponse.json({ skipped: "already posted", week });
  }

  try {
    const previous = await consensusForWeek(snapshot.season, week - 1);
    const rows = buildConsensus(ballots, previous ?? undefined);
    const cards = new Map(snapshot.profiles.map((p) => [p.name as string, p]));

    // Announce to the channel, and tag Sam directly. `discordNameFor` falls
    // back to a bold name for anyone whose Discord id isn't in config.json yet,
    // so this reads correctly before the ids are filled in — it just won't ping.
    const sam = discordNameFor("sam");

    await postToDiscord({
      content: `@everyone ${sam.text} Week ${week} power rankings are final.`,
      everyone: true,
      mentions: sam.id ? [sam.id] : [],
      embeds: [
        {
          title: `Week ${week} Power Rankings`,
          description: board(rows, cards),
          color: ACCENT,
          footer: {
            text: `${ballots.length} of ${snapshot.profiles.length} ballots · voting closed`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    });

    return NextResponse.json({ posted: true, week, ballots: ballots.length });
  } catch (err) {
    // Give the claim back so the next run can retry rather than staying silent
    // forever because of one bad request.
    await release(key);
    if (err instanceof DiscordNotConfigured) {
      return NextResponse.json({ error: "DISCORD_WEBHOOK_URL is not set" }, { status: 500 });
    }
    console.error("rankings post failed", err);
    return NextResponse.json({ error: "post failed" }, { status: 502 });
  }
}
