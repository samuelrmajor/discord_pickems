/**
 * Posting to Discord through an incoming webhook.
 *
 * A webhook rather than a bot: there is no gateway connection to keep alive, no
 * OAuth, and no token to rotate — just a URL that is itself the credential,
 * which is why it lives in an env var and never in the repo.
 */

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

/** Discord's own caps. Exceeding either is a 400, so we trim instead. */
const CONTENT_LIMIT = 2000;
const DESCRIPTION_LIMIT = 4096;

export type Embed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  footer?: { text: string };
  timestamp?: string;
};

export type DiscordMessage = {
  content?: string;
  embeds?: Embed[];
  /**
   * Discord user IDs to actually notify. Anyone mentioned in `content` who is
   * not listed here renders as a mention but pings nobody.
   */
  mentions?: string[];
  /**
   * Ping the whole server. Off by default — this notifies every member, so it
   * belongs on the handful of posts the league actually wants interrupting them.
   */
  everyone?: boolean;
};

export class DiscordNotConfigured extends Error {
  constructor() {
    super("DISCORD_WEBHOOK_URL is not set");
    this.name = "DiscordNotConfigured";
  }
}

function clamp(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * A user mention. Discord wants the numeric ID, not the username: turn on
 * Developer Mode (Settings -> Advanced) and right-click a member -> Copy User ID.
 *
 * Only works in `content`. In an embed it renders as a mention but notifies
 * nobody, which looks correct and silently fails.
 */
export function mention(discordUserId: string): string {
  return `<@${discordUserId}>`;
}

export async function postToDiscord(message: DiscordMessage): Promise<void> {
  if (!WEBHOOK) throw new DiscordNotConfigured();

  /**
   * Notify exactly who was asked for and nobody else.
   *
   * `parse` stays empty unless `everyone` is set, and never includes "roles":
   * an unparsed mention still renders, it just doesn't fire. The explicit
   * `users` list is the only way an individual gets pinged.
   *
   * Team names come from Sleeper and are whatever people typed, so one of them
   * could contain a literal "@everyone" — but names only ever appear in the
   * embed, and embed mentions don't notify. `content` is ours alone.
   */
  const allowed_mentions = {
    parse: message.everyone ? ["everyone"] : [],
    users: message.mentions ?? [],
  };

  const body = {
    allowed_mentions,
    ...(message.content ? { content: clamp(message.content, CONTENT_LIMIT) } : {}),
    ...(message.embeds
      ? {
          embeds: message.embeds.map((e) => ({
            ...e,
            ...(e.description ? { description: clamp(e.description, DESCRIPTION_LIMIT) } : {}),
          })),
        }
      : {}),
  };

  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // The body carries Discord's actual complaint; the status alone is useless.
    throw new Error(`Discord webhook ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
