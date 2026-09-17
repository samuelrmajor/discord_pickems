/**
 * Fast, DB-free checks on the power-ranking rules and week windows.
 * Run with: npx tsx scripts/test-fantasy.ts
 */
import assert from "node:assert/strict";
import { MEMBER_NAMES } from "../src/lib/fantasy/config";
import { buildConsensus, normalizeOrder, type Ballot } from "../src/lib/fantasy/rankings";
import { buildWeeks, currentRankingWeek, phaseOf } from "../src/lib/fantasy/week";

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
  console.log("  ok -", label);
}

const ET = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);

function ballot(voter: string, order: string[]): Ballot {
  return { voter, order: normalizeOrder(order), lockedIn: true, updatedAt: new Date() };
}

console.log("\nweek windows");

const WEEKS = buildWeeks("2026-09-09");

check("every week opens Tuesday 1:00 AM and locks Thursday 6:00 PM ET", () => {
  for (const w of WEEKS) {
    assert.equal(ET(w.opensAt), "Tue 1:00 AM", `week ${w.week} open`);
    assert.equal(ET(w.locksAt), "Thu 6:00 PM", `week ${w.week} lock`);
  }
});

check("the wall clock survives the November DST change", () => {
  // Week 8 is EDT and week 10 is EST; the gap between them is not 14 * 24h.
  const gap = WEEKS[9].opensAt.getTime() - WEEKS[7].opensAt.getTime();
  assert.equal(gap, 14 * 86_400_000 + 3_600_000);
});

check("phases follow the window", () => {
  const w = WEEKS[2];
  assert.equal(phaseOf(w, new Date(w.opensAt.getTime() - 1)), "upcoming");
  assert.equal(phaseOf(w, w.opensAt), "open");
  assert.equal(phaseOf(w, new Date(w.locksAt.getTime() - 1)), "open");
  assert.equal(phaseOf(w, w.locksAt), "locked");
});

check("the current week is the last one to have opened", () => {
  assert.equal(currentRankingWeek(WEEKS, new Date("2026-08-01T00:00:00Z")), 1);
  // Monday of week 2's slate: week 2 is open, week 3 has not started.
  assert.equal(currentRankingWeek(WEEKS, new Date("2026-09-21T12:00:00Z")), 2);
  assert.equal(currentRankingWeek(WEEKS, WEEKS[2].opensAt), 3);
  assert.equal(currentRankingWeek(WEEKS, new Date("2027-06-01T00:00:00Z")), 18);
});

console.log("\nballots");

check("a short ballot is completed in league order", () => {
  const order = normalizeOrder(["gus", "sam"]);
  assert.equal(order.length, MEMBER_NAMES.length);
  assert.deepEqual(order.slice(0, 2), ["gus", "sam"]);
  assert.equal(new Set(order).size, MEMBER_NAMES.length);
});

check("duplicates and strangers are dropped", () => {
  const order = normalizeOrder(["sam", "sam", "nobody", "gus"]);
  assert.deepEqual(order.slice(0, 2), ["sam", "gus"]);
  assert.equal(order.length, MEMBER_NAMES.length);
});

console.log("\nconsensus");

check("consensus averages positions across ballots", () => {
  const a = [...MEMBER_NAMES];
  const b = [a[1], a[0], ...a.slice(2)];
  const rows = buildConsensus([ballot("sam", a), ballot("dom", b)]);
  // Both were ranked 1st once and 2nd once, so they tie on average and the
  // better single placement breaks it.
  assert.equal(rows[0].average, 1.5);
  assert.equal(rows[1].average, 1.5);
  assert.deepEqual([rows[0].best, rows[0].worst], [1, 2]);
});

check("a steady 4th beats a split between 1st and last", () => {
  const steady = "gus";
  const swingy = "sam";
  const make = (first: string, fourth: string) => {
    const rest = MEMBER_NAMES.filter((n) => n !== first && n !== fourth);
    return [first, rest[0], rest[1], fourth, ...rest.slice(2)];
  };
  const rows = buildConsensus([
    ballot("a", make(swingy, steady)),
    ballot("b", make(MEMBER_NAMES[5], steady).map((n) => (n === swingy ? "__" : n))),
  ]);
  const s = rows.find((r) => r.name === steady)!;
  const w = rows.find((r) => r.name === swingy)!;
  assert.ok(s.average < w.average, `${s.average} should beat ${w.average}`);
});

check("deltas are positive when a team climbs", () => {
  const a = [...MEMBER_NAMES];
  const previous = buildConsensus([ballot("sam", a)]);
  const climber = a[3];
  const next = [climber, ...a.filter((n) => n !== climber)];
  const rows = buildConsensus([ballot("sam", next)], previous);
  assert.equal(rows.find((r) => r.name === climber)!.rank, 1);
  assert.equal(rows.find((r) => r.name === climber)!.delta, 3);
  assert.equal(rows.find((r) => r.name === a[0])!.delta, -1);
});

check("no ballots means no ranks to report", () => {
  const rows = buildConsensus([]);
  assert.equal(rows.length, MEMBER_NAMES.length);
  assert.ok(rows.every((r) => r.rank === 0 && r.delta === null));
});

console.log(`\n${checks} checks passed.`);
