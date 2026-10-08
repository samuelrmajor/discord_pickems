"use server";

import { revalidatePath } from "next/cache";
import { setReminders } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";

/** Turn Discord reminder pings on or off for the signed-in user. */
export async function toggleReminders(enabled: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await setReminders(user, enabled);
  revalidatePath("/");
  return { ok: true };
}
