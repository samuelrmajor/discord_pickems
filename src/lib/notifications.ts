import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationPrefs } from "@/db/schema";

/**
 * Who wants to be pinged about what.
 *
 * Absence means enabled throughout: a row is only ever written when someone
 * turns a module *off*, so nobody has to opt in to hear about something they
 * already signed up for, and adding a module doesn't start it silent.
 */

export async function getPrefsForUser(userName: string): Promise<Record<string, boolean>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userName, userName));
  return Object.fromEntries(rows.map((r) => [r.moduleKey, r.enabled]));
}

/** The set of users who have *not* switched this module off. */
export async function notifiableUsers(
  moduleKey: string,
  candidates: readonly string[]
): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.moduleKey, moduleKey));

  const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.userName));
  return new Set(candidates.filter((name) => !off.has(name)));
}

export async function setNotificationPref(
  userName: string,
  moduleKey: string,
  enabled: boolean
): Promise<void> {
  if (enabled) {
    // Back to the default, so drop the row rather than storing `true`.
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
    .values({ userName, moduleKey, enabled: false, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [notificationPrefs.userName, notificationPrefs.moduleKey],
      set: { enabled: false, updatedAt: new Date() },
    });
}
