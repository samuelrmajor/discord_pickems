"use server";

import { revalidatePath } from "next/cache";
import { MEMBER_NAMES } from "@/lib/fantasy/config";
import { isLeagueAdmin } from "@/lib/fantasy/admin";
import { saveBallot } from "@/lib/fantasy/ballots";
import { getLock, lockWeek, unlockWeek } from "@/lib/fantasy/lock";
import { readSnapshot } from "@/lib/fantasy/snapshot";
import { canSeeModule } from "@/lib/modules";
import { buildWeeks, currentRankingWeek, phaseOf } from "@/lib/fantasy/week";
import { getCurrentUser } from "@/lib/session";

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Persist a ballot. The week's phase is re-checked here rather than trusted
 * from the client, so a tab left open when Pat closes the week can't write.
 */
export async function submitBallot(
  week: number,
  order: string[],
  lockedIn: boolean
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not signed in" };
  if (!canSeeModule(user, "fantasy")) return { ok: false, error: "not available" };
  if (!MEMBER_NAMES.includes(user as never)) {
    return { ok: false, error: "not in the fantasy league" };
  }

  const snapshot = await readSnapshot();
  if (!snapshot) return { ok: false, error: "league data not loaded yet" };

  const weeks = buildWeeks(snapshot.seasonStartDate);
  const target = weeks.find((w) => w.week === week);
  if (!target) return { ok: false, error: "no such week" };

  const locked = (await getLock(snapshot.season, week)) !== null;
  const phase = phaseOf(target, locked);
  if (phase === "locked") return { ok: false, error: "voting closed for this week" };
  if (phase === "upcoming") return { ok: false, error: "voting has not opened yet" };
  if (week !== currentRankingWeek(weeks)) {
    return { ok: false, error: "that week is no longer current" };
  }

  await saveBallot(snapshot.season, week, user, order, lockedIn);
  revalidatePath("/fantasy");
  return { ok: true };
}

/**
 * Close (or reopen) a week's voting. Pat only.
 *
 * Locking is what reveals everyone's ballots, so it is deliberately a person's
 * decision rather than a deadline: the board opens up when the league is
 * actually done, not when a clock says so. It stays reversible because the
 * mis-tap is the only likely mistake here.
 */
export async function setWeekLock(week: number, locked: boolean): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not signed in" };
  if (!canSeeModule(user, "fantasy")) return { ok: false, error: "not available" };
  if (!isLeagueAdmin(user)) return { ok: false, error: "only Pat can close a week" };

  const snapshot = await readSnapshot();
  if (!snapshot) return { ok: false, error: "league data not loaded yet" };

  const weeks = buildWeeks(snapshot.seasonStartDate);
  const target = weeks.find((w) => w.week === week);
  if (!target) return { ok: false, error: "no such week" };
  // A week nobody could vote in yet has nothing to close.
  if (phaseOf(target, false) === "upcoming") {
    return { ok: false, error: "voting has not opened yet" };
  }

  if (locked) await lockWeek(snapshot.season, week, user);
  else await unlockWeek(snapshot.season, week);

  revalidatePath("/fantasy");
  return { ok: true };
}
