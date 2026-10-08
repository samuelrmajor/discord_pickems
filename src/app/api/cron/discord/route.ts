import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { fantasyCache } from "@/db/schema";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { DiscordNotConfigured, postToDiscord, type DiscordMessage } from "@/lib/discord";
import { dueJobs, JOBS, type JobDef } from "@/lib/fantasy/announcements";
import { getWeekBallots } from "@/lib/fantasy/ballots";
import { MEMBERS } from "@/lib/fantasy/config";
import { getLock } from "@/lib/fantasy/lock";
import {
  asTestPost,
  nudgeMessage,
  votingOpenMessage,
  type Recipient,
} from "@/lib/fantasy/messages";
import { readSnapshot } from "@/lib/fantasy/snapshot";
import { fetchCalendar } from "@/lib/espn";
import { getWeekGames, getWeekPicks } from "@/lib/queries";
import { buildSubmissions } from "@/lib/scoring";
import { ensureWeekFresh } from "@/lib/sync";
import { remindersFor } from "@/lib/notifications";
import {
  buildWeeks,
  currentRankingWeek,
  phaseOf,
  type RankingWeek,
} from "@/lib/fantasy/week";

export const dynamic = "force-dynamic";

/**
 * Claim the right to send one post, atomically.
 *
 * The workflow runs every half hour and each job stays due for a grace window,
 * so the same post is offered several times over. An insert that conflicts
 * returns no rows, so exactly one caller ever wins.
 */
async function claim(key: string): Promise<boolean> {
  const rows = await db
    .insert(fantasyCache)
    .values({ key, payload: { postedAt: new Date().toISOString() } })
    .onConflictDoNothing()
    .returning({ key: fantasyCache.key });
  return rows.length > 0;
}

async function release(key: string): Promise<void> {
  await db.delete(fantasyCache).where(eq(fantasyCache.key, key));
}

/**
 * Every scheduled Discord post for the fantasy module, driven by one endpoint.
 *
 * The schedule lives in Eastern time (see `announcements`), not in the cron
 * expression, so a single half-hourly trigger covers every post and daylight
 * saving can't shift any of them. Everything sent from here is a prompt to
 * vote; the results board is Pat's to post by hand.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await readSnapshot();
  if (!snapshot) return NextResponse.json({ skipped: "no league snapshot yet" });

  const weeks = buildWeeks(snapshot.seasonStartDate);
  const week = weeks[currentRankingWeek(weeks) - 1];
  // Whether voting is still open is Pat's call, not the clock's, so the phase
  // has to be read from the database before anything can be judged due.
  const phase = phaseOf(week, (await getLock(snapshot.season, week.week)) !== null);

  const params = new URL(request.url).searchParams;
  const forced = params.get("job");
  if (forced) {
    return forceOne(forced, snapshot, week, {
      dry: params.get("dry") === "1",
      ping: params.get("ping") === "1",
    });
  }

  const due = dueJobs(week, phase);
  if (due.length === 0) {
    return NextResponse.json({ week: week.week, phase, due: [], sent: [] });
  }

  const sent: string[] = [];
  const skipped: Record<string, string> = {};

  for (const job of due) {
    const key = `posted:${job.id}:${snapshot.season}:${week.week}`;
    if (!(await claim(key))) {
      skipped[job.id] = "already sent";
      continue;
    }
    try {
      const message = await buildMessage(job, snapshot, week.week);
      if (!message) {
        // Nothing worth saying (e.g. everyone already locked in). Keep the
        // claim so we don't reconsider it every half hour for the rest of the
        // grace window.
        skipped[job.id] = "nothing to say";
        continue;
      }
      await postToDiscord(message);
      sent.push(job.id);
    } catch (err) {
      // Hand the claim back so a later run can retry, rather than the post
      // being lost for the week because of one bad request.
      await release(key);
      if (err instanceof DiscordNotConfigured) {
        return NextResponse.json({ error: "DISCORD_WEBHOOK_URL is not set" }, { status: 500 });
      }
      console.error(`discord job ${job.id} failed`, err);
      skipped[job.id] = "failed";
    }
  }

  return NextResponse.json({
    week: week.week,
    phase,
    due: due.map((j) => j.id),
    sent,
    skipped,
  });
}

type Snapshot = NonNullable<Awaited<ReturnType<typeof readSnapshot>>>;

/**
 * Send one post on demand, for testing the pipeline end to end.
 *
 * Deliberately claim-free: a test must not consume the week's real post, or
 * trying Wednesday's nudge on a Tuesday would leave Wednesday silent. It also
 * strips mentions unless `ping=1`, so a smoke test doesn't buzz eleven phones,
 * and marks the message as a test so nobody in the channel acts on it.
 */
async function forceOne(
  jobId: string,
  snapshot: Snapshot,
  week: RankingWeek,
  opts: { dry: boolean; ping: boolean }
) {
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) {
    return NextResponse.json(
      { error: `unknown job "${jobId}"`, valid: JOBS.map((j) => j.id) },
      { status: 400 }
    );
  }

  const built = await buildMessage(job, snapshot, week.week);
  if (!built) {
    return NextResponse.json({
      forced: job.id,
      skipped: "nothing to say for this job right now",
    });
  }

  const message = asTestPost(built, opts.ping);

  if (opts.dry) {
    return NextResponse.json({ forced: job.id, dry: true, message });
  }

  await postToDiscord(message);
  return NextResponse.json({ forced: job.id, sent: true, pinged: opts.ping });
}

/**
 * Everyone's pick'em card for the live NFL week, by login name.
 *
 * Best effort by design: this reaches ESPN for the current week, and a reminder
 * that can still chase the poll is worth more than one that fails because a
 * third party is down. On failure the checklist prints "?" for the column.
 */
async function pickemProgress(): Promise<Map<string, PickemCard> | null> {
  try {
    const { season, currentWeek } = await fetchCalendar();
    await ensureWeekFresh(season, currentWeek);
    const games = await getWeekGames(season, currentWeek);
    const picks = await getWeekPicks(games);
    const rows = buildSubmissions(
      MEMBERS.map((m) => m.name),
      games,
      picks
    );
    return new Map(
      rows.map((row) => [
        row.name,
        // `done` means nothing left that can still be picked, so a game someone
        // slept through doesn't nag them for the rest of the week.
        { made: row.picked, total: row.total, done: row.done },
      ])
    );
  } catch (err) {
    console.error("pick'em progress unavailable for the reminder", err);
    return null;
  }
}

type PickemCard = { made: number; total: number; done: boolean };

/**
 * The league as the posts see it: who to ping, who to merely name, and what
 * each of them still owes.
 */
async function audience(snapshot: Snapshot, week: number): Promise<Recipient[]> {
  const [ballots, notifiable, pickems] = await Promise.all([
    getWeekBallots(snapshot.season, week),
    remindersFor(MEMBERS.map((m) => m.name)),
    pickemProgress(),
  ]);

  const lockedIn = new Set(ballots.filter((b) => b.lockedIn).map((b) => b.voter));
  const teamNames = new Map(snapshot.profiles.map((p) => [p.name as string, p.teamName]));

  return MEMBERS.map((member) => ({
    name: member.name,
    realName: member.realName,
    discordId: member.discordUserId,
    notify: notifiable.has(member.name),
    teamName: teamNames.get(member.name) ?? member.realName,
    lockedIn: lockedIn.has(member.name),
    picks: pickems?.get(member.name) ?? null,
  }));
}

async function buildMessage(
  job: JobDef,
  snapshot: Snapshot,
  week: number
): Promise<DiscordMessage | null> {
  const everyone = await audience(snapshot, week);
  return job.id === "open"
    ? votingOpenMessage(week, everyone)
    : nudgeMessage(week, everyone);
}
