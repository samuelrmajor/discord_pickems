/**
 * Fast, DB-free checks on the grading + consensus rules.
 * Run with: npx tsx scripts/test-scoring.ts
 */
import assert from "node:assert/strict";
import type { GameRow, PickRow } from "../src/db/schema";
import { buildConsensus, buildStandings, recordFor } from "../src/lib/scoring";

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
  console.log("  ok -", label);
}

function game(id: string, over: Partial<GameRow> = {}): GameRow {
  return {
    id,
    season: 2026,
    week: 1,
    kickoffAt: new Date("2026-09-13T17:00:00Z"),
    shortName: `A${id} @ H${id}`,
    homeAbbr: `H${id}`,
    homeName: `Home ${id}`,
    homeLogo: null,
    awayAbbr: `A${id}`,
    awayName: `Away ${id}`,
    awayLogo: null,
    favorite: "home",
    spread: 3,
    coinFlip: "home",
    status: "final",
    statusDetail: "Final",
    homeScore: 24,
    awayScore: 17,
    winner: "home",
    updatedAt: new Date(),
    ...over,
  };
}

function pick(userName: string, gameId: string, choice: "home" | "away"): PickRow {
  return { userName, gameId, choice, updatedAt: new Date() };
}

console.log("recordFor");
check("counts hits and misses, ignores unpicked games", () => {
  const games = [game("1"), game("2", { winner: "away" }), game("3")];
  const rec = recordFor(games, [pick("sam", "1", "home"), pick("sam", "2", "home")]);
  assert.deepEqual(rec, { wins: 1, losses: 1 });
});

check("a push grades nobody", () => {
  const games = [game("1", { winner: "push" })];
  assert.deepEqual(recordFor(games, [pick("sam", "1", "home")]), { wins: 0, losses: 0 });
});

check("unfinished games do not grade", () => {
  const games = [game("1", { winner: null, status: "in_progress" })];
  assert.deepEqual(recordFor(games, [pick("sam", "1", "home")]), { wins: 0, losses: 0 });
});

console.log("buildConsensus");
check("majority takes the leg", () => {
  const games = [game("1")];
  const picks = [
    pick("sam", "1", "home"),
    pick("dom", "1", "home"),
    pick("pat", "1", "away"),
  ];
  const [leg] = buildConsensus(games, picks);
  assert.equal(leg.side, "home");
  assert.equal(leg.decidedByCoinFlip, false);
  assert.equal(leg.totalVotes, 3);
  assert.equal(leg.result, "win");
});

check("a 6-6 deadlock falls to the pre-drawn coin flip", () => {
  const games = [game("1", { coinFlip: "away" })];
  const picks = [
    ...["sam", "dom", "pat", "ido", "evan", "henry"].map((u) => pick(u, "1", "home")),
    ...["chase", "david_w", "david_d", "jackson", "gus", "josh"].map((u) => pick(u, "1", "away")),
  ];
  const [leg] = buildConsensus(games, picks);
  assert.equal(leg.side, "away");
  assert.equal(leg.decidedByCoinFlip, true);
  assert.equal(leg.homeVotes, 6);
  assert.equal(leg.awayVotes, 6);
  // Home won the game, so riding the coin-flipped away side loses the leg.
  assert.equal(leg.result, "loss");
});

check("zero votes is not treated as a deadlock", () => {
  const [leg] = buildConsensus([game("1", { coinFlip: "away" })], []);
  assert.equal(leg.side, "away", "still falls back to the coin flip");
  assert.equal(leg.decidedByCoinFlip, false, "but is not labelled a tie-break");
  assert.equal(leg.totalVotes, 0);
});

check("a push voids the leg rather than losing it", () => {
  const games = [game("1", { winner: "push" })];
  const [leg] = buildConsensus(games, [pick("sam", "1", "home")]);
  assert.equal(leg.result, "push");
});

console.log("buildStandings");
check("ranks by weekly record and shares ranks on ties", () => {
  const weekGames = [game("1"), game("2"), game("3")];
  const weekPicks = [
    // sam 3-0
    pick("sam", "1", "home"),
    pick("sam", "2", "home"),
    pick("sam", "3", "home"),
    // dom 2-1
    pick("dom", "1", "home"),
    pick("dom", "2", "home"),
    pick("dom", "3", "away"),
    // pat 2-1
    pick("pat", "1", "home"),
    pick("pat", "2", "away"),
    pick("pat", "3", "home"),
  ];
  const standings = buildStandings(
    ["sam", "dom", "pat", "ido"],
    weekGames,
    weekPicks,
    weekGames,
    weekPicks
  );

  assert.equal(standings[0].name, "sam");
  assert.deepEqual([standings[0].wins, standings[0].losses], [3, 0]);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 2);
  assert.equal(standings[2].rank, 2, "equal 2-1 records share rank 2");
  assert.equal(standings[3].name, "ido", "a member with no picks still appears");
  assert.equal(standings[3].rank, 4, "and the next rank skips to 4");
});

check("season totals are carried alongside the weekly record", () => {
  const weekGames = [game("1")];
  const seasonGames = [game("1"), game("9", { week: 2 })];
  const weekPicks = [pick("sam", "1", "home")];
  const seasonPicks = [...weekPicks, pick("sam", "9", "home")];
  const [row] = buildStandings(["sam"], weekGames, weekPicks, seasonGames, seasonPicks);
  assert.deepEqual([row.wins, row.losses], [1, 0]);
  assert.deepEqual([row.seasonWins, row.seasonLosses], [2, 0]);
});

console.log(`\n${checks} checks passed.`);
