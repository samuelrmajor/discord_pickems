import raw from "../../../config.json";
import { isUser, type UserName } from "../users";

type RawConfig = {
  league_id: string;
  users: Record<string, { sleeper_user_id: string; discord_user_id?: string }>;
};

const config = raw as RawConfig;

export const LEAGUE_ID = config.league_id;

export type Member = {
  /** App login name, e.g. "david_w". */
  name: UserName;
  /** Human name as written in config.json, e.g. "David W". */
  realName: string;
  sleeperUserId: string;
  /**
   * Numeric Discord ID, for pinging them. Null until someone fills it in —
   * Discord posts fall back to the plain name rather than a broken mention.
   */
  discordUserId: string | null;
};

/** "David W" -> "david_w", matching the login names in lib/users. */
function slug(realName: string): string {
  return realName.trim().toLowerCase().replace(/\s+/g, "_");
}

export const MEMBERS: Member[] = Object.entries(config.users).flatMap(
  ([realName, { sleeper_user_id, discord_user_id }]) => {
    const name = slug(realName);
    // A config entry with no matching login is dropped rather than crashing the
    // module: the pick'em side owns the roster of logins, and a typo here
    // shouldn't take down both.
    if (!isUser(name)) {
      console.warn(`config.json user "${realName}" has no matching login; skipping`);
      return [];
    }
    return [
      {
        name,
        realName,
        sleeperUserId: sleeper_user_id,
        discordUserId: discord_user_id?.trim() ? discord_user_id.trim() : null,
      },
    ];
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

/**
 * How to refer to a member in a Discord message: a real ping when we know their
 * Discord ID, their name in bold otherwise. Returns the mention string and the
 * id (if any) to pass through `allowed_mentions`.
 */
export function discordNameFor(name: string): { text: string; id: string | null } {
  const member = memberByName(name);
  if (!member) return { text: name, id: null };
  if (!member.discordUserId) return { text: `**${member.realName}**`, id: null };
  return { text: `<@${member.discordUserId}>`, id: member.discordUserId };
}
