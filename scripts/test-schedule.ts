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
  resultsMessage,
  votingOpenMessage,
  type Recipient,
} from "../src/lib/fantasy/messages";
import { buildConsensus, normalizeOrder, type Ballot } from "../src/lib/fantasy/rankings";
import { buildWeeks } from "../src/lib/fantasy/week";

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
  console.log("  ok -", label);
}

const WEEKS = buildWeeks("2026-09-09");
const LOCKS = WEEKS[2].locksAt;

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
    "nudge-tue": "Tue 7:00 PM",
    "nudge-wed": "Wed 7:00 PM",
    "nudge-thu": "Thu 5:00 PM",
    results: "Sat 3:00 PM",
  };
  for (const w of WEEKS) {
    for (const job of JOBS) {
      assert.equal(ET(scheduledAt(job, w)), expected[job.id], `${job.id} in week ${w.week}`);
    }
  }
});

check("the results post goes out exactly when voting locks", () => {
  const results = JOBS.find((j) => j.id === "results")!;
  for (const w of WEEKS) {
    assert.equal(scheduledAt(results, w).getTime(), w.locksAt.getTime(), `week ${w.week}`);
  }
});

check("a job is due at its time and stays due through the grace window", () => {
  const w = WEEKS[2];
  const at = scheduledAt(JOBS.find((j) => j.id === "open")!, w);
  const ids = (now: Date) => dueJobs(w, now).map((j) => j.id);
  assert.deepEqual(ids(new Date(at.getTime() - 1)), []);
  assert.deepEqual(ids(at), ["open"]);
  assert.deepEqual(ids(new Date(at.getTime() + 90 * 60 * 1000)), ["open"]);
  assert.deepEqual(ids(new Date(at.getTime() + 3 * 60 * 60 * 1000)), []);
});

check("no nudge ever fires once voting has closed", () => {
  const w = WEEKS[2];
  const nudges = JOBS.filter((j) => j.id.startsWith("nudge")).map((j) => j.id);
  assert.ok(nudges.length > 0);
  for (const minutes of [1, 60, 24 * 60]) {
    const after = new Date(w.locksAt.getTime() + minutes * 60 * 1000);
    const due = dueJobs(w, after).map((j) => j.id);
    assert.ok(
      !due.some((id) => nudges.includes(id)),
      `${minutes}min after the lock still had ${due.join(",")}`
    );
  }
});

check("every reminder falls inside the voting window", () => {
  for (const w of WEEKS) {
    for (const job of JOBS.filter((j) => j.requires === "open")) {
      const at = scheduledAt(job, w).getTime();
      assert.ok(at > w.opensAt.getTime(), `${job.id} fires before voting opens`);
      assert.ok(at < w.locksAt.getTime(), `${job.id} fires after voting closes`);
    }
  }
});

check("results only become due once the week is locked", () => {
  const w = WEEKS[2];
  const before = new Date(w.locksAt.getTime() - 60 * 1000);
  assert.ok(!dueJobs(w, before).some((j) => j.id === "results"));
  assert.ok(dueJobs(w, w.locksAt).some((j) => j.id === "results"));
});

check("nothing is due in the quiet stretches between posts", () => {
  const w = WEEKS[2];
  // Wednesday lunchtime: after Tuesday's posts, long before Wednesday's.
  assert.deepEqual(dueJobs(w, scheduledAt(JOBS[2], w)).map((j) => j.id), ["nudge-wed"]);
  const quiet = new Date(scheduledAt(JOBS[2], w).getTime() - 5 * 60 * 60 * 1000);
  assert.deepEqual(dueJobs(w, quiet), []);
});

console.log("\nwho gets pinged");

check("a muted member is named by team, never pinged", () => {
  const league = [person({ name: "sam" }), person({ name: "gus", notify: false })];
  const msg = votingOpenMessage(3, LOCKS, league);
  assert.ok(msg.content!.includes("<@id-sam>"), "unmuted member is mentioned");
  assert.ok(msg.content!.includes("gus FC"), "muted member is named by team");
  assert.ok(!msg.content!.includes("<@id-gus>"), "muted member is not mentioned");
  assert.deepEqual(msg.mentions, ["id-sam"], "only unmuted ids may fire a ping");
});

check("no post pings the whole server", () => {
  const league = [person({ name: "sam" })];
  assert.equal(votingOpenMessage(3, LOCKS, league).everyone, undefined);
  assert.equal(nudgeMessage(3, LOCKS, league)!.everyone, undefined);
});

check("the nudge addresses only those who haven't locked in", () => {
  const league = [
    person({ name: "sam", lockedIn: true }),
    person({ name: "gus" }),
    person({ name: "pat", notify: false }),
  ];
  const msg = nudgeMessage(3, LOCKS, league)!;
  assert.ok(!msg.content!.includes("sam"), "someone locked in is left out entirely");
  assert.ok(msg.content!.includes("<@id-gus>"));
  assert.ok(msg.content!.includes("pat FC"));
  assert.deepEqual(msg.mentions, ["id-gus"]);
});

check("no nudge is sent when everyone has locked in", () => {
  const league = MEMBER_NAMES.map((name) => person({ name, lockedIn: true }));
  assert.equal(nudgeMessage(3, LOCKS, league), null);
});

check("a member with no Discord id falls back to their team name", () => {
  const msg = nudgeMessage(3, LOCKS, [person({ name: "gus", discordId: null })])!;
  assert.ok(msg.content!.includes("gus FC"));
  assert.deepEqual(msg.mentions, []);
});

check("the open announcement carries the deadline and the link", () => {
  const msg = votingOpenMessage(3, LOCKS, [person({ name: "sam" })]);
  assert.ok(msg.content!.includes("Sat 3:00 PM"));
  assert.ok(msg.content!.includes("/fantasy"));
});

check("the results post honours mutes too", () => {
  const league = [person({ name: "sam" }), person({ name: "gus", notify: false })];
  const ballot = (voter: string): Ballot => ({
    voter,
    order: normalizeOrder([...MEMBER_NAMES]),
    lockedIn: true,
    updatedAt: new Date(),
  });
  const msg = resultsMessage(
    3,
    buildConsensus([ballot("sam"), ballot("gus")]),
    new Map(),
    2,
    league
  );

  assert.deepEqual(msg.mentions, ["id-sam"]);
  assert.ok(msg.content!.includes("gus FC"));
  assert.equal(msg.everyone, undefined);
  assert.equal(msg.embeds![0].footer!.text, "2 of 2 ballots");
});

check("one dissenting ballot moves a unanimous average off 1.00", () => {
  const others = MEMBER_NAMES.filter((n) => n !== "sam");
  const ballot = (voter: string, order: string[]): Ballot => ({
    voter,
    order: normalizeOrder(order),
    lockedIn: true,
    updatedAt: new Date(),
  });
  const first = ["sam", ...others];
  const last = [...others, "sam"];

  // Twelve first-place votes.
  const unanimous = buildConsensus(MEMBER_NAMES.map((v) => ballot(v, first)));
  assert.equal(unanimous.find((r) => r.name === "sam")!.average, 1);

  // Eleven first-place votes and one last-place vote.
  const split = buildConsensus([...others.map((v) => ballot(v, first)), ballot("sam", last)]);
  const sam = split.find((r) => r.name === "sam")!;
  assert.equal(sam.average, 23 / 12, "(11 x 1st + 1 x 12th) / 12");
  assert.equal(sam.average.toFixed(2), "1.92");
  assert.deepEqual([sam.best, sam.worst], [1, 12]);

  // And that is the number the board prints.
  const printed = resultsMessage(3, split, new Map(), 12, [person({ name: "sam" })]);
  assert.ok(printed.embeds![0].description!.includes("1.92"), printed.embeds![0].description);
});

console.log("\nmanual test sends");

check("a test post is marked and stays silent by default", () => {
  const league = [person({ name: "sam" }), person({ name: "gus" })];
  const real = votingOpenMessage(3, LOCKS, league);
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
  const test = asTestPost(votingOpenMessage(3, LOCKS, league), true);
  assert.deepEqual(test.mentions, ["id-sam"], "still honours mutes");
  assert.ok(test.content!.includes("gus FC"));
});

check("a test of the results post keeps its embed", () => {
  const ballot = (voter: string): Ballot => ({
    voter,
    order: normalizeOrder([...MEMBER_NAMES]),
    lockedIn: true,
    updatedAt: new Date(),
  });
  const real = resultsMessage(3, buildConsensus([ballot("sam")]), new Map(), 1, [
    person({ name: "sam" }),
  ]);
  const test = asTestPost(real, false);
  assert.equal(test.embeds!.length, 1);
  assert.equal(test.embeds![0].title, "Week 3 Power Rankings");
  assert.deepEqual(test.mentions, []);
});

console.log(`\n${checks} checks passed.`);
