/**
 * Who closes a week's voting.
 *
 * Deliberately free of `config.ts`: the UI needs this name, and importing the
 * league config into a client component would ship everyone's Discord IDs to
 * the browser along with it.
 *
 * A single hard-coded name is honest about what this is. Pat calls the week
 * when the ballots are in and posts the board to Discord by hand, which is why
 * nothing about closing a week is on a timer. Login here is a name and a
 * cookie, so this is who the app *shows the button to*, not a security
 * boundary.
 */
import type { UserName } from "../users";

export const ADMIN: UserName = "pat";

/** How to write the admin's name in a Discord post or on screen. */
export const ADMIN_LABEL = "Pat";

export function isLeagueAdmin(name: string): boolean {
  return name === ADMIN;
}
