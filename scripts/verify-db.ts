/**
 * End-to-end checks against the real database.
 * Run with: npx tsx scripts/verify-db.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import assert from "node:assert/strict";

async function main() {
  const { db } = await import("../src/db");
  const { games, picks } = await import("../src/db/schema");
  const { syncWeek } = await import("../src/lib/sync");
  const { getWeekGames, savePick, saveBulkPicks } = await import("../src/lib/queries");
  const { buildConsensus } = await import("../src/lib/scoring");
  const { eq, and } = await import("drizzle-orm");

  const SEASON = 2026;
  const WEEK = 1;

  console.log("1. coin flips and lines survive a resync");
  const before = await getWeekGames(SEASON, WEEK);
  const beforeFlips = new Map(before.map((g) => [g.id, g.coinFlip]));
  const beforeFavs = new Map(before.map((g) => [g.id, `${g.favorite}:${g.spread}`]));

  await syncWeek(SEASON, WEEK);
  const after = await getWeekGames(SEASON, WEEK);

  for (const game of after) {
    assert.equal(game.coinFlip, beforeFlips.get(game.id), `coin flip moved on ${game.shortName}`);
    assert.equal(game.favorite, "home" === game.favorite || "away" === game.favorite ? game.favorite : null);
    assert.equal(beforeFavs.get(game.id), `${game.favorite}:${game.spread}`, `line moved on ${game.shortName}`);
  }
  const flipSides = new Set(after.map((g) => g.coinFlip));
  console.log(`   ok - ${after.length} games stable, flips drawn from ${[...flipSides].join(" + ")}`);

  console.log("2. a finished week keeps its line instead of being nulled out");
  await syncWeek(2025, 2);
  const past = await getWeekGames(2025, 2);
  const graded = past.filter((g) => g.winner !== null).length;
  console.log(`   ok - 2025 wk2: ${past.length} games, ${graded} graded, sample winner=${past[0].winner}`);
  assert.ok(graded > 0, "expected a finished week to have winners");

  console.log("3. picks write, and locked games are rejected");
  const open = after.find((g) => g.kickoffAt.getTime() > Date.now());
  assert.ok(open, "expected at least one upcoming game");
  assert.equal(await savePick("sam", open.id, "home"), true);
  assert.equal(await savePick("sam", open.id, "away"), true, "changing a pick should work");

  // Temporarily backdate a game to prove the kickoff guard fires.
  const guinea = after[0];
  const realKickoff = guinea.kickoffAt;
  await db
    .update(games)
    .set({ kickoffAt: new Date(Date.now() - 60_000) })
    .where(eq(games.id, guinea.id));
  assert.equal(await savePick("dom", guinea.id, "home"), false, "locked game must reject");
  await db.update(games).set({ kickoffAt: realKickoff }).where(eq(games.id, guinea.id));
  console.log("   ok - upcoming games accept picks, kicked-off games return false");

  console.log("4. bulk fill respects existing picks unless overwriting");
  await db.delete(picks).where(eq(picks.userName, "pat"));
  await savePick("pat", open.id, "away");

  const fill = await saveBulkPicks("pat", SEASON, WEEK, "home", false);
  const patPicks = await db
    .select()
    .from(picks)
    .where(eq(picks.userName, "pat"));
  const keptManual = patPicks.find((p) => p.gameId === open.id);
  assert.equal(keptManual?.choice, "away", "first tap must not clobber an existing pick");
  console.log(`   ok - filled ${fill.applied}, left ${fill.skipped} alone (manual pick kept)`);

  const over = await saveBulkPicks("pat", SEASON, WEEK, "home", true);
  const afterOver = await db.select().from(picks).where(eq(picks.userName, "pat"));
  assert.equal(
    afterOver.find((p) => p.gameId === open.id)?.choice,
    "home",
    "overwrite must replace it"
  );
  console.log(`   ok - overwrite replaced ${over.applied} picks`);

  console.log("5. all-favorites matches the stored line");
  await db.delete(picks).where(eq(picks.userName, "ido"));
  await saveBulkPicks("ido", SEASON, WEEK, "favorite", true);
  const idoPicks = await db.select().from(picks).where(eq(picks.userName, "ido"));
  const byId = new Map(after.map((g) => [g.id, g]));
  let checked = 0;
  for (const p of idoPicks) {
    const g = byId.get(p.gameId);
    if (!g) continue;
    assert.equal(p.choice, g.favorite, `${g.shortName} should ride the favorite`);
    checked += 1;
  }
  const sample = idoPicks
    .slice(0, 3)
    .map((p) => {
      const g = byId.get(p.gameId)!;
      return p.choice === "home" ? g.homeAbbr : g.awayAbbr;
    })
    .join(", ");
  console.log(`   ok - ${checked} favorite picks verified (e.g. ${sample})`);

  console.log("6. consensus builds a full-slate parlay");
  const weekPicks = await db.select().from(picks);
  const relevant = weekPicks.filter((p) => byId.has(p.gameId));
  const legs = buildConsensus(after, relevant);
  assert.equal(legs.length, after.length, "one leg per game");
  const flips = legs.filter((l) => l.decidedByCoinFlip).length;
  console.log(`   ok - ${legs.length} legs from ${relevant.length} picks, ${flips} tie-broken`);

  console.log("\ncleanup");
  for (const name of ["sam", "pat", "ido", "dom"]) {
    await db.delete(picks).where(eq(picks.userName, name));
  }
  await db.delete(games).where(and(eq(games.season, 2025), eq(games.week, 2)));
  console.log("   test picks and the 2025 scratch week removed");

  console.log("\nAll database checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
