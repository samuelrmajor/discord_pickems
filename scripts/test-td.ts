/**
 * Fast, DB-free checks on the anytime-TD price math and grading.
 * Run with: npx tsx scripts/test-td.ts
 */
import assert from "node:assert/strict";
import { matchEvent } from "../src/lib/td/odds-api";
import {
  americanToDecimal,
  decimalToAmerican,
  formatAmericanLong,
  gradeLeg,
  nameKey,
  parlayState,
  quoteParlay,
} from "../src/lib/td/odds";

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
  console.log("  ok -", label);
}

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

console.log("odds");

check("american -> decimal, both signs", () => {
  close(americanToDecimal(250), 3.5);
  close(americanToDecimal(100), 2);
  close(americanToDecimal(-200), 1.5);
});

check("decimal -> american round-trips book prices", () => {
  for (const price of [-300, -150, -110, 100, 110, 150, 400, 1200]) {
    assert.equal(decimalToAmerican(americanToDecimal(price)), price);
  }
});

check("two +100 legs make a +300 parlay paying 4x", () => {
  const q = quoteParlay([100, 100], 12);
  assert.equal(q.american, 300);
  close(q.payout, 48);
  assert.equal(q.priced, 2);
});

check("unpriced legs are left out and counted, not guessed", () => {
  const q = quoteParlay([100, null, 100, null], 12);
  assert.equal(q.priced, 2);
  assert.equal(q.unpriced, 2);
  assert.equal(q.american, 300);
});

check("no prices at all quotes nothing", () => {
  const q = quoteParlay([null, null], 12);
  assert.equal(q.priced, 0);
  assert.equal(q.payout, 0);
});

check("long parlays format with separators", () => {
  assert.equal(formatAmericanLong(123456), "+123,456");
  assert.equal(formatAmericanLong(-150), "-150");
});

console.log("names");

check("suffixes and punctuation don't block a match", () => {
  assert.equal(nameKey("Aaron Jones Sr."), nameKey("Aaron Jones"));
  assert.equal(nameKey("D.J. Moore"), nameKey("DJ Moore"));
  assert.equal(nameKey("Odell Beckham Jr."), nameKey("Odell Beckham"));
  assert.equal(nameKey("Ja'Marr Chase"), nameKey("JaMarr Chase"));
  assert.equal(nameKey("Amon-Ra St. Brown"), nameKey("AmonRa St Brown"));
  assert.equal(nameKey("Marvin Harrison Jr."), nameKey("Marvin Harrison"));
});

check("different people stay different", () => {
  assert.notEqual(nameKey("Josh Allen"), nameKey("Josh Jacobs"));
});

check("odds events match on home team and a nearby kickoff", () => {
  const events = [
    { id: "a", homeTeam: "Minnesota Vikings", awayTeam: "Buffalo Bills", commenceTime: "2026-11-10T01:15:00Z" },
    { id: "b", homeTeam: "Minnesota Vikings", awayTeam: "Detroit Lions", commenceTime: "2026-11-17T18:00:00Z" },
  ];
  const game = { homeName: "Minnesota Vikings", kickoffAt: new Date("2026-11-10T01:15:00Z") };
  assert.equal(matchEvent(events, game)?.id, "a");
  assert.equal(matchEvent(events, { ...game, homeName: "Chicago Bears" }), null);
});

console.log("grading");

const box = { scorers: ["1"], appeared: ["1", "2"] };

check("a touchdown is a hit the moment it lands, even mid-game", () => {
  assert.equal(gradeLeg("in_progress", box, "1"), "hit");
  assert.equal(gradeLeg("final", box, "1"), "hit");
});

check("no touchdown is live until the final whistle, then a miss", () => {
  assert.equal(gradeLeg("in_progress", box, "2"), "live");
  assert.equal(gradeLeg("final", box, "2"), "miss");
});

check("a player missing from a final box score didn't play: void", () => {
  assert.equal(gradeLeg("final", box, "3"), "void");
});

check("before kickoff, or with no box score read yet, nothing is called", () => {
  assert.equal(gradeLeg("scheduled", null, "1"), "pending");
  assert.equal(gradeLeg("final", null, "1"), "pending");
});

console.log("parlay state");

check("nothing decided yet is open", () => {
  assert.equal(parlayState(["pending", "live"]).state, "open");
});

check("hits with legs still to play is alive", () => {
  const s = parlayState(["hit", "live", "pending"]);
  assert.equal(s.state, "alive");
  assert.deepEqual([s.hit, s.live, s.pending], [1, 1, 1]);
});

check("one busted leg busts the ticket, whatever else hit", () => {
  assert.equal(parlayState(["hit", "hit", "miss", "pending"]).state, "busted");
});

check("every leg in with none busted cashes, voids and all", () => {
  assert.equal(parlayState(["hit", "void", "hit"]).state, "cashed");
});

check("an all-void ticket hasn't cashed anything", () => {
  assert.equal(parlayState(["void", "void"]).state, "open");
});

console.log(`\n${checks} checks passed.`);
