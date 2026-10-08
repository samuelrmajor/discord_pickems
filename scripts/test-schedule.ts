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
    realName: over.name,
    discordId: `id-${over.name}`,
    notify: true,
    teamName: `${over.name} FC`,
    lockedIn: false,
    picks: { made: 14, total: 14, done: true },
    ...over,
  };
}

/** Someone with everything in, so only the deliberate gaps show up in a test. */
const settled = (name: string) => person({ name, lockedIn: true });

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

check("the nudge addresses only the people who still owe something", () => {
  const league = [
    settled("sam"),
    person({ name: "gus" }),
    person({ name: "pat", notify: false }),
  ];
  const msg = nudgeMessage(3, league)!;
  assert.ok(!msg.content!.includes("<@id-sam>"), "someone all done is not pinged");
  assert.ok(msg.content!.includes("<@id-gus>"));
  assert.ok(msg.content!.includes("pat FC"));
  assert.deepEqual(msg.mentions, ["id-gus"]);
});

check("outstanding picks are chased even with the ballot in", () => {
  const league = [
    settled("sam"),
    person({ name: "gus", lockedIn: true, picks: { made: 3, total: 14, done: false } }),
  ];
  const msg = nudgeMessage(3, league)!;
  assert.deepEqual(msg.mentions, ["id-gus"]);
  assert.ok(msg.embeds![0].description!.includes("3/14"));
});

check("a game slept through stops counting against them", () => {
  // 13 of 14 picked and nothing left open: there is nothing left to nag about.
  const league = [
    person({ name: "gus", lockedIn: true, picks: { made: 13, total: 14, done: true } }),
  ];
  assert.equal(nudgeMessage(3, league), null);
});

check("no nudge is sent when everyone is all done", () => {
  assert.equal(nudgeMessage(3, MEMBER_NAMES.map(settled)), null);
});

check("an unreadable slate falls back to chasing the poll alone", () => {
  const league = [
    person({ name: "sam", lockedIn: true, picks: null }),
    person({ name: "gus", lockedIn: false, picks: null }),
  ];
  const msg = nudgeMessage(3, league)!;
  assert.deepEqual(msg.mentions, ["id-gus"], "only the missing ballot is chased");
  assert.ok(msg.embeds![0].description!.includes("?"), "the picks column admits it");
});

check("a member with no Discord id falls back to their team name", () => {
  const msg = nudgeMessage(3, [person({ name: "gus", discordId: null })])!;
  assert.ok(msg.content!.includes("gus FC"));
  assert.deepEqual(msg.mentions, []);
});

check("the checklist names everyone and flags only who is behind", () => {
  const league = [
    settled("sam"),
    person({ name: "gus", picks: { made: 0, total: 14, done: false } }),
    person({ name: "pat", notify: false, lockedIn: true }),
  ];
  const table = nudgeMessage(3, league)!.embeds![0];

  assert.ok(table.description!.startsWith("```"), "it renders as a monospace block");
  for (const name of ["sam", "gus", "pat"]) {
    assert.ok(table.description!.includes(name), `${name} is listed`);
  }
  assert.ok(table.description!.includes("14/14"), "sam's picks are in");
  assert.ok(table.description!.includes("0/14"), "gus has none in");
  assert.equal(table.footer!.text, "2 of 3 all done");

  // One "!" per person behind, and the rows line up under the header.
  const lines = table.description!.split("\n").slice(2, -1);
  assert.equal(lines.filter((l) => l.startsWith("!")).length, 1);
  assert.equal(new Set(lines.map((l) => l.length)).size, 1, lines.join("|"));
});

check("the checklist can't be turned into a mass ping", () => {
  // Team names come from Sleeper, so one could say anything. It only ever
  // reaches the embed, where a mention renders but notifies nobody.
  const league = [person({ name: "gus", teamName: "@everyone", notify: false })];
  const msg = nudgeMessage(3, league)!;
  assert.equal(msg.everyone, undefined);
  assert.deepEqual(msg.mentions, []);
});

check("no post promises a deadline the app no longer enforces", () => {
  const league = [person({ name: "sam" })];
  for (const msg of [votingOpenMessage(3, league), nudgeMessage(3, league)!]) {
    assert.ok(!/\d:\d\d\s?(AM|PM)/i.test(msg.content!), msg.content);
    assert.ok(msg.content!.includes("Pat"), "it says who closes voting instead");
  }
});

check("each post links where it wants you to go", () => {
  // The poll announcement is about the poll. A reminder covers both modules, so
  // it points at the hub and lets the checklist say which one you are short on.
  assert.ok(votingOpenMessage(3, [person({ name: "sam" })]).content!.includes("/fantasy"));
  const nudge = nudgeMessage(3, [person({ name: "sam" })])!.content!;
  assert.ok(nudge.includes("http"), nudge);
  assert.ok(!nudge.includes("/fantasy"), nudge);
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
  assert.ok(test.content!.includes("Week 3 of the Coach's Poll is open"));
  assert.ok(test.content!.includes("<@id-sam>"), "names still render, they just don't fire");
});

check("ping=1 exercises the real mentions", () => {
  const league = [person({ name: "sam" }), person({ name: "gus", notify: false })];
  const test = asTestPost(votingOpenMessage(3, league), true);
  assert.deepEqual(test.mentions, ["id-sam"], "still honours mutes");
  assert.ok(test.content!.includes("gus FC"));
});

console.log(`\n${checks} checks passed.`);
