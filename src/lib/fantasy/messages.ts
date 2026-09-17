/**
 * The text of each scheduled Discord post.
 *
 * Kept apart from the route so the wording can be read, changed and tested
 * without any of the plumbing around it.
 */
import type { DiscordMessage } from "../discord";
import type { ConsensusRow } from "./rankings";
import type { ProfileCard } from "./profiles";
import { formatET } from "./time";

const APP_URL = process.env.APP_URL ?? "https://discordpickems.vercel.app";

const RANKINGS_URL = `${APP_URL}/fantasy`;

/** Discord embed accent, matching the app's green. */
const ACCENT = 0x3ddc84;

/**
 * One league member as far as a Discord post is concerned.
 *
 * `notify` is their switch on the hub. Someone who has muted the module still
 * gets named — being muted means "don't ping me", not "leave me out" — they
 * just appear as their Sleeper team name rather than a mention.
 */
export type Recipient = {
  name: string;
  discordId: string | null;
  notify: boolean;
  /** Sleeper team name, used in place of a ping. */
  teamName: string;
  lockedIn: boolean;
};

type Reference = { text: string; id: string | null };

function refer(person: Recipient): Reference {
  if (person.notify && person.discordId) {
    return { text: `<@${person.discordId}>`, id: person.discordId };
  }
  return { text: person.teamName, id: null };
}

/** Render a group, and collect the ids that should actually fire a ping. */
function addressTo(people: Recipient[]): { line: string; ids: string[] } {
  const refs = people.map(refer);
  return {
    line: refs.map((r) => r.text).join(", "),
    ids: refs.map((r) => r.id).filter((id): id is string => id !== null),
  };
}

/** Tuesday morning: the ballot is live. */
export function votingOpenMessage(
  week: number,
  locksAt: Date,
  everyone: Recipient[]
): DiscordMessage {
  const { line, ids } = addressTo(everyone);
  return {
    content: [
      `**Week ${week} power rankings are open.**`,
      `Rank the league before **${formatET(locksAt)} ET** — your week ${week - 1} order is already loaded, so it's a few drags if nothing much changed.`,
      RANKINGS_URL,
      "",
      line,
    ].join("\n"),
    mentions: ids,
  };
}

/**
 * A nudge aimed only at the people holding everyone else up.
 *
 * Returns null when nobody is outstanding: a reminder addressed to no one is
 * just noise in the channel.
 */
export function nudgeMessage(
  week: number,
  locksAt: Date,
  everyone: Recipient[]
): DiscordMessage | null {
  const pending = everyone.filter((p) => !p.lockedIn);
  if (pending.length === 0) return null;

  const { line, ids } = addressTo(pending);
  return {
    content: [
      line,
      `You haven't locked in your **Week ${week}** rankings. Voting closes **${formatET(locksAt)} ET**.`,
      RANKINGS_URL,
    ].join("\n"),
    mentions: ids,
  };
}

/**
 * Re-shape a real post into a test post.
 *
 * Marked so nobody in the channel acts on it, and silent by default: a smoke
 * test of the workflow should not buzz eleven phones. Pass `ping` to exercise
 * the mentions for real.
 */
export function asTestPost(message: DiscordMessage, ping: boolean): DiscordMessage {
  return {
    ...message,
    content: `\u{1F9EA} **Test post** — ignore.\n${message.content ?? ""}`,
    ...(ping ? {} : { mentions: [], everyone: false }),
  };
}

function movement(delta: number | null): string {
  if (delta === null) return "  ";
  if (delta === 0) return " -";
  return delta > 0 ? `+${Math.min(delta, 9)}` : `-${Math.min(-delta, 9)}`;
}

function board(rows: ConsensusRow[], cards: Map<string, ProfileCard>): string {
  const lines = rows.map((row) => {
    const name = (cards.get(row.name)?.teamName ?? row.name).slice(0, 20).padEnd(20);
    return [
      String(row.rank).padStart(2),
      movement(row.delta),
      name,
      row.average.toFixed(2).padStart(5),
    ].join("  ");
  });
  return ["```", " #   Δ   Team                    Avg", ...lines, "```"].join("\n");
}

/** Thursday evening: voting has closed, here is the board. */
export function resultsMessage(
  week: number,
  rows: ConsensusRow[],
  cards: Map<string, ProfileCard>,
  ballotCount: number,
  everyone: Recipient[]
): DiscordMessage {
  const { line, ids } = addressTo(everyone);

  return {
    content: [`**Week ${week} power rankings are final.**`, "", line].join("\n"),
    mentions: ids,
    embeds: [
      {
        title: `Week ${week} Power Rankings`,
        description: board(rows, cards),
        url: RANKINGS_URL,
        color: ACCENT,
        footer: { text: `${ballotCount} of ${everyone.length} ballots` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
