/**
 * The two #gambling posts that go out once the week's first game (Thursday
 * night) kicks off: everyone's anytime-TD leg, and the Pick'em consensus.
 *
 * Pure — the cron route gathers the facts, this only words them. Names are
 * plain text: nothing posted to #gambling pings anyone.
 */
import type { DiscordMessage } from "./discord";
import type { ConsensusLeg } from "./scoring";
import { formatAmerican } from "./td/odds";
import { ticketLine } from "./td/announce";

const APP_URL = process.env.APP_URL ?? "https://discordpickems.vercel.app";

/** Discord embed accent, matching the app's green. */
const ACCENT = 0x3ddc84;

export type LockedLeg = {
  /** Who picked, as a plain name ("David W"). */
  who: string;
  player: string;
  /** "MIN @ CHI" */
  matchup: string;
  kickoffAt: Date;
  price: number | null;
};

/*
 * Every line here has to fit a phone without wrapping, so they are cut to the
 * bone: "MIN @ CHI T 8pm | **Sam** J.Jefferson +150".
 */

export function tdLockMessage(
  week: number,
  legs: LockedLeg[],
  /** Members with no leg in, as plain names. */
  missing: string[],
  members: number,
  stake: number
): DiscordMessage {
  const rows = [...legs]
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.who.localeCompare(b.who))
    .map(
      (l) =>
        `${l.matchup} ${shortKickoff(l.kickoffAt)} | **${l.who}** ${shortName(l.player)}` +
        (l.price === null ? "" : ` ${formatAmerican(l.price)}`)
    );

  const lines = [
    ...(rows.length ? rows : ["No TD picks are in."]),
    ...(missing.length ? ["", `**No pick:** ${missing.join(", ")}`] : []),
    "",
    ticketLine(
      legs.map((l) => l.price),
      members,
      stake
    ),
  ];

  return embed(`Week ${week} TD parlay is locked`, lines, `${APP_URL}/touchdowns`);
}

/** "**MIN** - CHI | 9/12 | T 8pm": away - home, the group's pick in bold. */
export function pickemLockMessage(week: number, legs: ConsensusLeg[]): DiscordMessage {
  const rows = [...legs]
    .sort((a, b) => a.game.kickoffAt.getTime() - b.game.kickoffAt.getTime())
    .map((leg) => {
      const { game } = leg;
      const team = (abbr: string, side: "home" | "away") =>
        side === leg.side ? `**${abbr}**` : abbr;
      const votes = leg.side === "home" ? leg.homeVotes : leg.awayVotes;
      const flip = leg.decidedByCoinFlip || leg.totalVotes === 0 ? "*" : "";
      return (
        `${team(game.awayAbbr, "away")} - ${team(game.homeAbbr, "home")}` +
        ` | ${votes}/${leg.totalVotes}${flip} | ${shortKickoff(game.kickoffAt)}`
      );
    });

  const lines = rows.length ? rows : ["No games this week."];
  const flipped = legs.some((leg) => leg.decidedByCoinFlip || leg.totalVotes === 0);
  if (flipped) lines.push("", "\\* tied, decided by coin flip");
  return embed(`Week ${week} Pick'em consensus is locked`, lines, `${APP_URL}/pickems`);
}

/** "Justin Jefferson" -> "J.Jefferson"; "Amon-Ra St. Brown" -> "A.St. Brown". */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first.charAt(0)}.${rest.join(" ")}` : first;
}

/**
 * Days that games actually fall on, one letter where that's unambiguous.
 * Saturday keeps two so it can't be read as Sunday.
 */
const DAY: Record<string, string> = {
  Sun: "S",
  Mon: "M",
  Tue: "Tu",
  Wed: "W",
  Thu: "T",
  Fri: "F",
  Sat: "Sa",
};

/** "T 8pm", Eastern, hour only: an 8:15 kickoff is just "8pm". */
export function shortKickoff(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: true,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("weekday");
  return `${DAY[day] ?? day} ${get("hour")}${get("dayPeriod").toLowerCase()}`;
}

function embed(title: string, lines: string[], url: string): DiscordMessage {
  return {
    embeds: [
      {
        title,
        description: lines.join("\n"),
        url,
        color: ACCENT,
        timestamp: new Date().toISOString(),
      },
    ],
    mentions: [],
    everyone: false,
  };
}

/** How long after the first kickoff a missed cron run may still send the posts. */
const GRACE_MS = 6 * 60 * 60 * 1000;

/** Due once the week's first game has kicked off, for a few hours after. */
export function lockPostsDue(kickoffs: Date[], now = new Date()): boolean {
  if (kickoffs.length === 0) return false;
  const first = Math.min(...kickoffs.map((k) => k.getTime()));
  return now.getTime() >= first && now.getTime() < first + GRACE_MS;
}
