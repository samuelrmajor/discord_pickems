"use server";

import { redirect } from "next/navigation";
import { setCurrentUser, clearCurrentUser } from "@/lib/session";
import { isUser } from "@/lib/users";

export async function login(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  if (!isUser(name)) redirect("/login");
  await setCurrentUser(name);
  redirect("/");
}

export async function logout() {
  await clearCurrentUser();
  redirect("/login");
}
