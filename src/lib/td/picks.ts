/** Storage for anytime-TD legs. The rules about what may be picked live in `actions`. */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tdPicks, type TdPickRow } from "@/db/schema";

export async function getWeekTdPicks(season: number, week: number): Promise<TdPickRow[]> {
  return db
    .select()
    .from(tdPicks)
    .where(and(eq(tdPicks.season, season), eq(tdPicks.week, week)));
}

export type NewTdPick = Omit<TdPickRow, "updatedAt">;

/**
 * Write a member's leg, replacing any earlier one for the week.
 *
 * Returns false when someone else already holds that player — the unique
 * index rejects the row, which is the only check that holds under two people
 * tapping the same name at once.
 */
export async function saveTdPick(pick: NewTdPick): Promise<boolean> {
  const updatedAt = new Date();
  try {
    await db
      .insert(tdPicks)
      .values({ ...pick, updatedAt })
      .onConflictDoUpdate({
        target: [tdPicks.season, tdPicks.week, tdPicks.userName],
        set: {
          athleteId: pick.athleteId,
          athleteName: pick.athleteName,
          position: pick.position,
          teamAbbr: pick.teamAbbr,
          gameId: pick.gameId,
          updatedAt,
        },
      });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export async function clearTdPick(season: number, week: number, userName: string): Promise<void> {
  await db
    .delete(tdPicks)
    .where(
      and(eq(tdPicks.season, season), eq(tdPicks.week, week), eq(tdPicks.userName, userName))
    );
}

function isUniqueViolation(err: unknown): boolean {
  // postgres.js surfaces the SQLSTATE as `code`; drizzle may wrap it in `cause`.
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(err) === "23505" || code((err as { cause?: unknown } | null)?.cause) === "23505";
}
