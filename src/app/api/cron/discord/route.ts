import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { fantasyCache } from "@/db/schema";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  DiscordNotConfigured,
  postToDiscord,
  postToGambling,
  type DiscordMessage,
} from "@/lib/discord";
import { dueJobs, JOBS, type JobDef } from "@/lib/fantasy/announcements";
import { getWeekBallots } from "@/lib/fantasy/ballots";
import { MEMBERS, memberByName } from "@/lib/fantasy/config";
import { getLock } from "@/lib/fantasy/lock";
import {
  asTestPost,
  nudgeMessage,
  votingOpenMessage,
  type Recipient,
} from "@/lib/fantasy/messages";
import { readSnapshot } from "@/lib/fantasy/snapshot";
import { lockPostsDue, pickemLockMessage, tdLockMessage } from "@/lib/lock-posts";
import { getWeekPicks } from "@/lib/queries";
import { buildConsensus, buildSubmissions } from "@/lib/scoring";
import { syncPickingWeek } from "@/lib/sync";
import { remindersFor } from "@/lib/notifications";
import { legPrices } from "@/lib/td/data";
import { getWeekTdPicks } from "@/lib/td/picks";
import { canSeeTd, tdProgress } from "@/lib/td/reminders";
import { USERS } from "@/lib/users";
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

  const params = new URL(request.url).searchParams;
  const forced = params.get("job");

  if (forced === LOCK_JOB) {
    return NextResponse.json(await lockPosts({ force: true, dry: params.get("dry") === "1" }));
  }
  // Independent of the Coach's Poll below, so it goes out even before there
  // is a league snapshot, and a failure there can't hold it up.
  const gambling = forced ? null : await lockPosts({ force: false, dry: false });

  const snapshot = await readSnapshot();
  if (!snapshot) return NextResponse.json({ skipped: "no league snapshot yet", gambling });

  const weeks = buildWeeks(snapshot.seasonStartDate);
  const week = weeks[currentRankingWeek(weeks) - 1];
  // Whether voting is still open is Pat's call, not the clock's, so the phase
  // has to be read from the database before anything can be judged due.
  const phase = phaseOf(week, (await getLock(snapshot.season, week.week)) !== null);

  if (forced) {
    return forceOne(forced, snapshot, week, {
      dry: params.get("dry") === "1",
      ping: params.get("ping") === "1",
    });
  }

  const due = dueJobs(week, phase);
  if (due.length === 0) {
    return NextResponse.json({ week: week.week, phase, due: [], sent: [], gambling });
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
    gambling,
  });
}

/** The forced-run name for the #gambling lock posts, as the workflow sends it. */
const LOCK_JOB = "gambling-lock";

/**
 * Once the week's first game (Thursday night) kicks off, post everyone's TD
 * leg and the Pick'em consensus to #gambling — once per week, claimed like
 * every other post.
 *
 * `force` sends now regardless of the clock or the claim, marked as a test, so
 * trying it out never uses up the week's real posts. `dry` builds without posting.
 */
async function lockPosts(opts: { force: boolean; dry: boolean }): Promise<object> {
  try {
    const { season, week, games } = await syncPickingWeek();
    if (!opts.force && !lockPostsDue(games.map((g) => g.kickoffAt))) return { week, due: false };

    const key = `posted:${LOCK_JOB}:${season}:${week}`;
    if (!opts.force && !(await claim(key))) return { week, due: true, skipped: "already sent" };

    try {
      const messages = await lockMessages(season, week, games);
      if (opts.dry) return { week, dry: true, messages };
      for (const message of messages) {
        const sent = await postToGambling(opts.force ? asTestPost(message, false) : message);
        if (!sent) {
          if (!opts.force) await release(key);
          return { week, skipped: "DISCORD_WEBHOOK_URL_GAMBLING is not set" };
        }
      }
      return { week, sent: messages.length, test: opts.force };
    } catch (err) {
      // Hand the claim back so the next run retries. A retry after the TD post
      // went through but the Pick'em one failed sends the TD post twice, which
      // beats losing the Pick'em post for the week.
      if (!opts.force) await release(key);
      throw err;
    }
  } catch (err) {
    console.error("#gambling lock posts failed", err);
    return { error: "failed" };
  }
}

async function lockMessages(
  season: number,
  week: number,
  games: Awaited<ReturnType<typeof syncPickingWeek>>["games"]
): Promise<DiscordMessage[]> {
  const [tdPicks, pickemPicks] = await Promise.all([
    getWeekTdPicks(season, week),
    getWeekPicks(games),
  ]);
  const prices = await legPrices(games, tdPicks, null);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const nameOf = (user: string) => memberByName(user)?.realName ?? user;

  const legs = tdPicks.flatMap((pick) => {
    const game = gamesById.get(pick.gameId);
    if (!game) return [];
    return [
      {
        who: nameOf(pick.userName),
        player: pick.athleteName,
        matchup: `${game.awayAbbr} @ ${game.homeAbbr}`,
        kickoffAt: game.kickoffAt,
        price: prices.get(pick.athleteId) ?? null,
      },
    ];
  });
  const picked = new Set(tdPicks.map((p) => p.userName));
  const missing = USERS.filter((u) => canSeeTd(u) && !picked.has(u)).map(nameOf);

  return [
    // A dollar a member, so the ticket is staked at the league size.
    tdLockMessage(week, legs, missing, USERS.length, USERS.length),
    pickemLockMessage(week, buildConsensus(games, pickemPicks)),
  ];
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
 * Everyone's pick'em card for the week being picked, by login name.
 *
 * Best effort by design: this reaches ESPN for the current week, and a reminder
 * that can still chase the poll is worth more than one that fails because a
 * third party is down. On failure the checklist prints "?" for the column.
 */
async function pickemProgress(): Promise<Map<string, PickemCard> | null> {
  try {
    // Next week's card from Tuesday on, not the week ESPN still calls current.
    const { games } = await syncPickingWeek();
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
  const [ballots, notifiable, pickems, tds] = await Promise.all([
    getWeekBallots(snapshot.season, week),
    remindersFor(MEMBERS.map((m) => m.name)),
    pickemProgress(),
    tdProgress(MEMBERS.map((m) => m.name)),
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
    // Left off entirely for anyone the module isn't open to yet.
    ...(canSeeTd(member.name) ? { td: tds?.get(member.name) ?? null } : {}),
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
