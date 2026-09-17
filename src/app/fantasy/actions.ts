"use server";

import { revalidatePath } from "next/cache";
import { MEMBER_NAMES } from "@/lib/fantasy/config";
import { saveBallot } from "@/lib/fantasy/ballots";
import { readSnapshot } from "@/lib/fantasy/snapshot";
import { canSeeModule } from "@/lib/modules";
import { buildWeeks, currentRankingWeek, phaseOf } from "@/lib/fantasy/week";
import { getCurrentUser } from "@/lib/session";

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Persist a ballot. The week's phase is re-checked here rather than trusted
 * from the client, so a tab left open past Thursday 5pm can't write.
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

  const phase = phaseOf(target);
  if (phase === "locked") return { ok: false, error: "voting closed for this week" };
  if (phase === "upcoming") return { ok: false, error: "voting has not opened yet" };
  if (week !== currentRankingWeek(weeks)) {
    return { ok: false, error: "that week is no longer current" };
  }

  await saveBallot(snapshot.season, week, user, order, lockedIn);
  revalidatePath("/fantasy");
  return { ok: true };
}
