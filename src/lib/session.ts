import { cookies } from "next/headers";
import { isUser, type UserName } from "./users";

export const SESSION_COOKIE = "pickem_user";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function getCurrentUser(): Promise<UserName | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  return isUser(value) ? value : null;
}

export async function setCurrentUser(name: UserName): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, name, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearCurrentUser(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
