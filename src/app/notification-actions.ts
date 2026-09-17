"use server";

import { revalidatePath } from "next/cache";
import { MODULES } from "@/lib/modules";
import { setNotificationPref } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";

/** Turn this module's Discord pings on or off for the signed-in user. */
export async function toggleNotifications(
  moduleKey: string,
  enabled: boolean
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  // Only real modules, so a stray key can't litter the table.
  if (!MODULES.some((m) => m.key === moduleKey)) return { ok: false };

  await setNotificationPref(user, moduleKey, enabled);
  revalidatePath("/");
  return { ok: true };
}
