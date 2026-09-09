"use server";

import { redirect } from "next/navigation";
import { setCurrentUser, clearCurrentUser } from "@/lib/session";
import { isUser } from "@/lib/users";

/**
 * The name is bound into the action rather than submitted as a field: React
 * commandeers the `name` prop on any button with a function formAction, so a
 * `<button name="name" value="sam">` never actually arrives.
 */
export async function login(name: string) {
  if (!isUser(name)) redirect("/login");
  await setCurrentUser(name);
  redirect("/");
}

export async function logout() {
  await clearCurrentUser();
  redirect("/login");
}
