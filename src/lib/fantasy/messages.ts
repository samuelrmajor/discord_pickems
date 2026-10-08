/**
 * The text of each scheduled Discord post.
 *
 * Kept apart from the route so the wording can be read, changed and tested
 * without any of the plumbing around it.
 *
 * Note what isn't here: a results post. The board is not announced by the app —
 * Pat closes the week and posts it by hand — so every message below is a prompt
 * to go and vote.
 */
import type { DiscordMessage } from "../discord";
import { ADMIN_LABEL } from "./admin";

const APP_URL = process.env.APP_URL ?? "https://discordpickems.vercel.app";

const POLL_URL = `${APP_URL}/fantasy`;

/** Discord embed accent, matching the app's green. */
const ACCENT = 0x3ddc84;

/**
 * One league member as far as a Discord post is concerned.
 *
 * `notify` is their reminders switch on the hub. Someone with it off still gets
 * named, and still appears in the checklist — off means "don't ping me", not
 * "leave me out" — they just show as their Sleeper team name rather than as a
 * mention.
 */
export type Recipient = {
  name: string;
  /** Human name, as the checklist writes it. */
  realName: string;
  discordId: string | null;
  notify: boolean;
  /** Sleeper team name, used in place of a ping. */
  teamName: string;
  /** Their Coach's Poll ballot, locked in or not. */
  lockedIn: boolean;
  /**
   * Their pick'em card for the live NFL week. Null when the slate couldn't be
   * read, in which case the reminder chases the poll alone rather than telling
   * twelve people they are behind on nothing.
   */
  picks: { made: number; total: number; done: boolean } | null;
};

/** Someone who still owes the league something this week. */
export function outstanding(person: Recipient): boolean {
  return !person.lockedIn || person.picks?.done === false;
}

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
export function votingOpenMessage(week: number, everyone: Recipient[]): DiscordMessage {
  const { line, ids } = addressTo(everyone);
  return {
    content: [
      `**Week ${week} of the Coach's Poll is open.**`,
      `Rank the league before ${ADMIN_LABEL} closes voting — your week ${week - 1} order is already loaded, so it's a few drags if nothing much changed.`,
      POLL_URL,
      "",
      line,
    ].join("\n"),
    mentions: ids,
  };
}

/**
 * A nudge addressed to whoever is holding the league up, with everyone's week
 * attached so it is obvious who that is.
 *
 * Returns null when nobody is outstanding: a reminder addressed to no one is
 * just noise in the channel.
 */
export function nudgeMessage(week: number, everyone: Recipient[]): DiscordMessage | null {
  const pending = everyone.filter(outstanding);
  if (pending.length === 0) return null;

  const { line, ids } = addressTo(pending);
  const done = everyone.length - pending.length;

  return {
    content: [
      line,
      `You've still got **Week ${week}** business outstanding. The poll closes as soon as ${ADMIN_LABEL} calls it, so don't sit on it.`,
      APP_URL,
    ].join("\n"),
    mentions: ids,
    embeds: [
      {
        title: `Week ${week} checklist`,
        description: checklist(everyone),
        url: APP_URL,
        color: ACCENT,
        footer: { text: `${done} of ${everyone.length} all done` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** How many of the week's games they have picked, or "?" if we couldn't tell. */
function picksCell(person: Recipient): string {
  if (!person.picks) return "    ?";
  return `${person.picks.made}/${person.picks.total}`.padStart(5);
}

/**
 * Everyone's week as a table: what each person has in, and what they still owe.
 *
 * It lives in the embed rather than the message body, which is what makes it
 * safe to print names people chose themselves — embed mentions render but never
 * notify, so a team called "@everyone" can't turn a reminder into a mass ping.
 * Every ping this post fires comes from the addressed line in `content`.
 */
function checklist(everyone: Recipient[]): string {
  const rows = everyone.map((person) =>
    [
      outstanding(person) ? "!" : " ",
      person.realName.slice(0, 12).padEnd(12),
      picksCell(person),
      person.lockedIn ? " in" : " --",
    ].join("  ")
  );
  // The header is spaced to the columns the rows build below: the name starts
  // at 3, the picks count at 17 and the ballot at 24.
  return ["```", "   Member        Picks  Poll", ...rows, "```"].join("\n");
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
