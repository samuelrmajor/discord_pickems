/** The league. Login is by name only — deliberately not secure. */
export const USERS = [
  "sam",
  "dom",
  "pat",
  "ido",
  "evan",
  "henry",
  "chase",
  "david_w",
  "david_d",
  "jackson",
  "gus",
  "josh",
] as const;

export type UserName = (typeof USERS)[number];

export function isUser(name: string | undefined | null): name is UserName {
  return !!name && (USERS as readonly string[]).includes(name);
}
