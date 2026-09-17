import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationPrefs } from "@/db/schema";

/**
 * Who wants to be pinged about what.
 *
 * Reminders are opt-in: absence means off, and a row is only written when
 * someone turns a module *on*. Nobody gets their phone buzzed by a module they
 * never asked to hear from, and a new module starts quiet for everyone.
 *
 * Being opted out only suppresses the ping — the Discord posts still name you,
 * by Sleeper team name instead of a mention.
 */

export async function getPrefsForUser(userName: string): Promise<Record<string, boolean>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userName, userName));
  return Object.fromEntries(rows.map((r) => [r.moduleKey, r.enabled]));
}

/** The users who have explicitly switched this module's reminders on. */
export async function notifiableUsers(
  moduleKey: string,
  candidates: readonly string[]
): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.moduleKey, moduleKey));

  const on = new Set(rows.filter((r) => r.enabled).map((r) => r.userName));
  return new Set(candidates.filter((name) => on.has(name)));
}

export async function setNotificationPref(
  userName: string,
  moduleKey: string,
  enabled: boolean
): Promise<void> {
  if (!enabled) {
    // Back to the default, so drop the row rather than storing `false`.
    await db
      .delete(notificationPrefs)
      .where(
        and(
          eq(notificationPrefs.userName, userName),
          eq(notificationPrefs.moduleKey, moduleKey)
        )
      );
    return;
  }

  await db
    .insert(notificationPrefs)
    .values({ userName, moduleKey, enabled: true, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [notificationPrefs.userName, notificationPrefs.moduleKey],
      set: { enabled: true, updatedAt: new Date() },
    });
}
