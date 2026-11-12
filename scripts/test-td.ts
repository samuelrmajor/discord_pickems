/**
 * Fast, DB-free checks on the anytime-TD price math and grading.
 * Run with: npx tsx scripts/test-td.ts
 */
import assert from "node:assert/strict";
import { pickAnnouncement, type PickAnnouncement } from "../src/lib/td/announce";
import { lockPostsDue, pickemLockMessage, tdLockMessage } from "../src/lib/lock-posts";
import type { ConsensusLeg } from "../src/lib/scoring";
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

console.log("\n#gambling announcement");

const base: PickAnnouncement = {
  week: 11,
  who: "David W",
  player: { name: "Justin Jefferson", pos: "WR", team: "MIN", injury: null },
  previous: null,
  // Sunday 1:00 PM ET.
  game: { awayAbbr: "MIN", homeAbbr: "CHI", kickoffAt: new Date("2026-11-15T18:00:00Z") },
  line: true,
  price: 100,
  legs: [100, 100, null],
  members: 12,
  stake: 12,
};
const text = (a: PickAnnouncement) => {
  const e = pickAnnouncement(a).embeds![0];
  return `${e.title}\n${e.description}`;
};

check("a first pick names who, the player, the matchup and his price", () => {
  const t = text(base);
  assert.ok(t.includes("David W locked in Justin Jefferson"), t);
  assert.ok(t.includes("WR, MIN"), t);
  assert.ok(t.includes("MIN @ CHI · Sun 1:00 PM ET"), t);
  assert.ok(t.includes("+100 (DraftKings)"), t);
  assert.ok(!t.includes("~~"), t);
});

check("a change says what it replaced", () => {
  const t = text({ ...base, previous: "Bijan Robinson" });
  assert.ok(t.includes("switched their TD pick to Justin Jefferson"), t);
  assert.ok(t.includes("~~Bijan Robinson~~ → **Justin Jefferson**"), t);
});

check("the ticket line closes the post: count, odds and the $12 payout", () => {
  const last = text(base).split("\n").at(-1)!;
  assert.ok(last.startsWith("**3/12** TD picks are in"), last);
  assert.ok(last.includes("current odds **+300**"), last);
  assert.ok(last.includes("total payout on $12: **$48**"), last);
  assert.ok(last.includes("1 unpriced leg left out"), last);
});

check("no price: says why, and the ticket waits for one", () => {
  const t = text({ ...base, price: null, line: false, legs: [null] });
  assert.ok(t.includes("no DraftKings line"), t);
  assert.ok(t.endsWith("**1/12** TD picks are in · no prices yet"), t);
});

check("an injury tag is shown when he has one", () => {
  const t = text({ ...base, player: { ...base.player, injury: "Questionable" } });
  assert.ok(t.includes("**Status:** Questionable"), t);
});

check("the post never pings anyone", () => {
  const m = pickAnnouncement(base);
  assert.deepEqual(m.mentions, []);
  assert.equal(m.everyone, false);
  assert.equal(m.content, undefined);
});

console.log("\n#gambling lock posts");

const at = (iso: string) => new Date(iso);
const THU = at("2026-11-13T01:15:00Z"); // Thu 8:15 PM ET
const SUN = at("2026-11-15T18:00:00Z"); // Sun 1:00 PM ET

check("the TD post: one short line per leg, by game time, then who's missing and the ticket", () => {
  const leg = (who: string, player: string, kickoffAt: Date, price: number | null) => ({
    who,
    player,
    matchup: "MIN @ CHI",
    kickoffAt,
    price,
  });
  const e = tdLockMessage(
    11,
    [leg("Sam", "Justin Jefferson", SUN, 100), leg("Gus", "Amon-Ra St. Brown", THU, 100)],
    ["Josh"],
    12,
    12
  ).embeds![0];
  const lines = e.description!.split("\n");
  assert.ok(e.title!.includes("Week 11 TD parlay"), e.title);
  assert.equal(lines[0], "MIN @ CHI T 8pm | **Gus** A.St. Brown +100");
  assert.equal(lines[1], "MIN @ CHI S 1pm | **Sam** J.Jefferson +100");
  assert.ok(e.description!.includes("**No pick:** Josh"), e.description);
  assert.ok(lines.at(-1)!.includes("**2/12** TD picks are in · current odds **+300**"), lines.at(-1));
});

check("the Pick'em post: away - home, the pick in bold, its votes, and the kickoff", () => {
  const game = (id: string, away: string, home: string, kickoffAt: Date) =>
    ({ id, awayAbbr: away, homeAbbr: home, kickoffAt }) as unknown as ConsensusLeg["game"];
  const legs: ConsensusLeg[] = [
    { game: game("2", "DAL", "NYG", SUN), side: "home", homeVotes: 6, awayVotes: 6, totalVotes: 12, decidedByCoinFlip: true, result: null },
    { game: game("1", "MIN", "CHI", THU), side: "away", homeVotes: 3, awayVotes: 9, totalVotes: 12, decidedByCoinFlip: false, result: null },
  ];
  const lines = pickemLockMessage(11, legs).embeds![0].description!.split("\n");
  assert.equal(lines[0], "**MIN** - CHI | 9/12 | T 8pm");
  assert.equal(lines[1], "DAL - **NYG** | 6/12* | S 1pm");
  assert.equal(lines.at(-1), "\\* tied, decided by coin flip");
});

check("no coin-flip footnote when nothing was tied", () => {
  const game = { id: "1", awayAbbr: "MIN", homeAbbr: "CHI", kickoffAt: THU } as unknown as ConsensusLeg["game"];
  const legs: ConsensusLeg[] = [
    { game, side: "home", homeVotes: 8, awayVotes: 4, totalVotes: 12, decidedByCoinFlip: false, result: null },
  ];
  const text = pickemLockMessage(11, legs).embeds![0].description!;
  assert.equal(text, "MIN - **CHI** | 8/12 | T 8pm");
});

check("lock posts are due from the first kickoff, for a few hours", () => {
  const kicks = [SUN, THU];
  assert.equal(lockPostsDue(kicks, at("2026-11-13T01:14:00Z")), false);
  assert.equal(lockPostsDue(kicks, at("2026-11-13T01:15:00Z")), true);
  assert.equal(lockPostsDue(kicks, at("2026-11-13T06:00:00Z")), true);
  assert.equal(lockPostsDue(kicks, at("2026-11-13T08:00:00Z")), false);
  assert.equal(lockPostsDue([], at("2026-11-13T02:00:00Z")), false);
});

check("lock posts never ping anyone", () => {
  for (const m of [tdLockMessage(11, [], [], 12, 12), pickemLockMessage(11, [])]) {
    assert.deepEqual(m.mentions, []);
    assert.equal(m.everyone, false);
  }
});

console.log(`\n${checks} checks passed.`);
