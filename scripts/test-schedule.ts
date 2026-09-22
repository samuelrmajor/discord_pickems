/**
 * Fast, DB-free checks on the scheduled Discord posts: when each one fires, and
 * who it addresses once notification preferences are taken into account.
 *
 * Run with: npx tsx scripts/test-schedule.ts
 */
import assert from "node:assert/strict";
import { dueJobs, JOBS, scheduledAt } from "../src/lib/fantasy/announcements";
import { MEMBER_NAMES } from "../src/lib/fantasy/config";
import {
  asTestPost,
  nudgeMessage,
  votingOpenMessage,
  type Recipient,
} from "../src/lib/fantasy/messages";
import { buildWeeks } from "../src/lib/fantasy/week";

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
  console.log("  ok -", label);
}

const WEEKS = buildWeeks("2026-09-09");

const ET = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);

function person(over: Partial<Recipient> & { name: string }): Recipient {
  return {
    discordId: `id-${over.name}`,
    notify: true,
    teamName: `${over.name} FC`,
    lockedIn: false,
    ...over,
  };
}

console.log("\nwhen posts fire");

check("every post lands on its Eastern wall-clock time, all season", () => {
  const expected: Record<string, string> = {
    open: "Tue 10:00 AM",
    "nudge-tue": "Tue 2:00 PM",
    "nudge-wed": "Wed 2:00 PM",
    "nudge-thu": "Thu 2:00 PM",
  };
  for (const w of WEEKS) {
    for (const job of JOBS) {
      assert.equal(ET(scheduledAt(job, w)), expected[job.id], `${job.id} in week ${w.week}`);
    }
  }
});

check("the reminders are Tuesday, Wednesday and Thursday at 2pm, and nothing else", () => {
  const nudges = JOBS.filter((j) => j.id.startsWith("nudge"));
  assert.deepEqual(
    nudges.map((j) => j.id),
    ["nudge-tue", "nudge-wed", "nudge-thu"]
  );
  for (const job of nudges) assert.equal(job.hour, 14, job.id);
});

check("nothing is scheduled to announce the results", () => {
  // Pat closes the week and posts the board by hand.
  assert.ok(!JOBS.some((j) => j.requires === "locked"));
  assert.ok(!JOBS.some((j) => j.id.includes("result")));
});

check("a job is due at its time and stays due through the grace window", () => {
  const w = WEEKS[2];
  const at = scheduledAt(JOBS.find((j) => j.id === "open")!, w);
  const ids = (now: Date) => dueJobs(w, "open", now).map((j) => j.id);
  assert.deepEqual(ids(new Date(at.getTime() - 1)), []);
  assert.deepEqual(ids(at), ["open"]);
  assert.deepEqual(ids(new Date(at.getTime() + 90 * 60 * 1000)), ["open"]);
  assert.deepEqual(ids(new Date(at.getTime() + 3 * 60 * 60 * 1000)), []);
});

check("no post fires once Pat has closed the week", () => {
  const w = WEEKS[2];
  for (const job of JOBS) {
    const at = scheduledAt(job, w);
    assert.deepEqual(dueJobs(w, "open", at).map((j) => j.id), [job.id], job.id);
    assert.deepEqual(dueJobs(w, "locked", at), [], `${job.id} still fired when locked`);
  }
});

check("nothing fires before voting opens", () => {
  const w = WEEKS[2];
  for (const job of JOBS) {
    assert.deepEqual(dueJobs(w, "upcoming", scheduledAt(job, w)), [], job.id);
    assert.ok(scheduledAt(job, w).getTime() > w.opensAt.getTime(), job.id);
  }
});

check("a week left open for days keeps nudging only on its own three days", () => {
  const w = WEEKS[2];
  // Friday afternoon, the week still unlocked: the old Friday post is gone.
  const friday = new Date(scheduledAt(JOBS[3], w).getTime() + 24 * 60 * 60 * 1000);
  assert.deepEqual(dueJobs(w, "open", friday), []);
});

check("nothing is due in the quiet stretches between posts", () => {
  const w = WEEKS[2];
  const wed = scheduledAt(JOBS.find((j) => j.id === "nudge-wed")!, w);
  assert.deepEqual(dueJobs(w, "open", wed).map((j) => j.id), ["nudge-wed"]);
  const quiet = new Date(wed.getTime() - 5 * 60 * 60 * 1000);
  assert.deepEqual(dueJobs(w, "open", quiet), []);
});

console.log("\nwho gets pinged");

check("a muted member is named by team, never pinged", () => {
  const league = [person({ name: "sam" }), person({ name: "gus", notify: false })];
  const msg = votingOpenMessage(3, league);
  assert.ok(msg.content!.includes("<@id-sam>"), "unmuted member is mentioned");
  assert.ok(msg.content!.includes("gus FC"), "muted member is named by team");
  assert.ok(!msg.content!.includes("<@id-gus>"), "muted member is not mentioned");
  assert.deepEqual(msg.mentions, ["id-sam"], "only unmuted ids may fire a ping");
});

check("no post pings the whole server", () => {
  const league = [person({ name: "sam" })];
  assert.equal(votingOpenMessage(3, league).everyone, undefined);
  assert.equal(nudgeMessage(3, league)!.everyone, undefined);
});

check("the nudge addresses only those who haven't locked in", () => {
  const league = [
    person({ name: "sam", lockedIn: true }),
    person({ name: "gus" }),
    person({ name: "pat", notify: false }),
  ];
  const msg = nudgeMessage(3, league)!;
  assert.ok(!msg.content!.includes("sam"), "someone locked in is left out entirely");
  assert.ok(msg.content!.includes("<@id-gus>"));
  assert.ok(msg.content!.includes("pat FC"));
  assert.deepEqual(msg.mentions, ["id-gus"]);
});

check("no nudge is sent when everyone has locked in", () => {
  const league = MEMBER_NAMES.map((name) => person({ name, lockedIn: true }));
  assert.equal(nudgeMessage(3, league), null);
});

check("a member with no Discord id falls back to their team name", () => {
  const msg = nudgeMessage(3, [person({ name: "gus", discordId: null })])!;
  assert.ok(msg.content!.includes("gus FC"));
  assert.deepEqual(msg.mentions, []);
});

check("no post promises a deadline the app no longer enforces", () => {
  const league = [person({ name: "sam" })];
  for (const msg of [votingOpenMessage(3, league), nudgeMessage(3, league)!]) {
    assert.ok(!/\d:\d\d\s?(AM|PM)/i.test(msg.content!), msg.content);
    assert.ok(msg.content!.includes("Pat"), "it says who closes voting instead");
    assert.ok(msg.content!.includes("/fantasy"));
  }
});

console.log("\nmanual test sends");

check("a test post is marked and stays silent by default", () => {
  const league = [person({ name: "sam" }), person({ name: "gus" })];
  const real = votingOpenMessage(3, league);
  assert.deepEqual(real.mentions, ["id-sam", "id-gus"], "the real post would ping both");

  const test = asTestPost(real, false);
  assert.ok(test.content!.startsWith("\u{1F9EA} **Test post**"));
  assert.deepEqual(test.mentions, [], "a test must not ping anyone");
  assert.equal(test.everyone, false);
  // The body is still the real message, so the test shows what will be sent.
  assert.ok(test.content!.includes("Week 3 power rankings are open"));
  assert.ok(test.content!.includes("<@id-sam>"), "names still render, they just don't fire");
});

check("ping=1 exercises the real mentions", () => {
  const league = [person({ name: "sam" }), person({ name: "gus", notify: false })];
  const test = asTestPost(votingOpenMessage(3, league), true);
  assert.deepEqual(test.mentions, ["id-sam"], "still honours mutes");
  assert.ok(test.content!.includes("gus FC"));
});

console.log(`\n${checks} checks passed.`);
