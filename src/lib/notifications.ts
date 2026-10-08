import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notificationPrefs } from "@/db/schema";

/**
 * Who wants to be pinged.
 *
 * One switch, for everything: the league gets a single reminder post covering
 * both modules, so a per-module preference would have been a choice nobody
 * could act on. `notification_prefs` keeps its per-module shape — the rows are
 * how the old switches are still read — but only one key is written now.
 *
 * Being opted out only suppresses the ping. The reminder still lists you and
 * still shows what you owe; it just uses your name instead of a mention.
 */

/** The only key written from now on. */
const REMINDERS = "reminders";

/**
 * The Coach's Poll switch, which is where everyone's current answer lives.
 *
 * It seeds this one rather than being migrated: a member who never touches the
 * new switch keeps exactly the setting they chose, and the first tap writes a
 * `reminders` row that shadows it forever after. That is also why "off" is
 * stored as `false` here rather than as a missing row — deleting it would fall
 * back to the old answer and switch the pings back on.
 */
const LEGACY = "fantasy";

export async function remindersEnabled(userName: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(
      and(
        eq(notificationPrefs.userName, userName),
        inArray(notificationPrefs.moduleKey, [REMINDERS, LEGACY])
      )
    );
  const own = rows.find((r) => r.moduleKey === REMINDERS);
  if (own) return own.enabled;
  return rows.find((r) => r.moduleKey === LEGACY)?.enabled ?? false;
}

/** Of these people, the ones a post may actually ping. */
export async function remindersFor(candidates: readonly string[]): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(inArray(notificationPrefs.moduleKey, [REMINDERS, LEGACY]));

  const chosen = new Map<string, boolean>();
  const legacy = new Map<string, boolean>();
  for (const row of rows) {
    if (row.moduleKey === REMINDERS) chosen.set(row.userName, row.enabled);
    else legacy.set(row.userName, row.enabled);
  }

  return new Set(
    candidates.filter((name) => chosen.get(name) ?? legacy.get(name) ?? false)
  );
}

export async function setReminders(userName: string, enabled: boolean): Promise<void> {
  await db
    .insert(notificationPrefs)
    .values({ userName, moduleKey: REMINDERS, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [notificationPrefs.userName, notificationPrefs.moduleKey],
      set: { enabled, updatedAt: new Date() },
    });
}
