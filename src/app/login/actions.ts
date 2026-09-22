"use server";

import { redirect } from "next/navigation";
import { moduleByHref } from "@/lib/modules";
import { setCurrentUser, clearCurrentUser } from "@/lib/session";
import { isUser } from "@/lib/users";

/**
 * The name is bound into the action rather than submitted as a field: React
 * commandeers the `name` prop on any button with a function formAction, so a
 * `<button name="name" value="sam">` never actually arrives.
 */
export async function login(name: string, form: FormData) {
  if (!isUser(name)) redirect("/login");
  await setCurrentUser(name);
  // `next` only ever survives as a known module href, so this cannot be
  // pointed anywhere off the site.
  const next = form.get("next");
  redirect(moduleByHref(typeof next === "string" ? next : undefined)?.href ?? "/");
}

export async function logout() {
  await clearCurrentUser();
  redirect("/login");
}
