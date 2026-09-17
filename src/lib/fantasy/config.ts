import raw from "../../../config.json";
import { isUser, type UserName } from "../users";

type RawConfig = {
  league_id: string;
  users: Record<string, { sleeper_user_id: string }>;
};

const config = raw as RawConfig;

export const LEAGUE_ID = config.league_id;

export type Member = {
  /** App login name, e.g. "david_w". */
  name: UserName;
  /** Human name as written in config.json, e.g. "David W". */
  realName: string;
  sleeperUserId: string;
};

/** "David W" -> "david_w", matching the login names in lib/users. */
function slug(realName: string): string {
  return realName.trim().toLowerCase().replace(/\s+/g, "_");
}

export const MEMBERS: Member[] = Object.entries(config.users).flatMap(
  ([realName, { sleeper_user_id }]) => {
    const name = slug(realName);
    // A config entry with no matching login is dropped rather than crashing the
    // module: the pick'em side owns the roster of logins, and a typo here
    // shouldn't take down both.
    if (!isUser(name)) {
      console.warn(`config.json user "${realName}" has no matching login; skipping`);
      return [];
    }
    return [{ name, realName, sleeperUserId: sleeper_user_id }];
  }
);

export const MEMBER_NAMES = MEMBERS.map((m) => m.name);

const BY_SLEEPER_ID = new Map(MEMBERS.map((m) => [m.sleeperUserId, m]));
const BY_NAME = new Map(MEMBERS.map((m) => [m.name as string, m]));

export function memberBySleeperId(id: string): Member | undefined {
  return BY_SLEEPER_ID.get(id);
}

export function memberByName(name: string): Member | undefined {
  return BY_NAME.get(name);
}
