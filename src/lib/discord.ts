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

export async function postToDiscord(message: DiscordMessage): Promise<void> {
  if (!WEBHOOK) throw new DiscordNotConfigured();

  const body: DiscordMessage = {
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
