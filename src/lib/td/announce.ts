/**
 * The #gambling post that goes out whenever someone picks, or changes, their
 * anytime-TD leg. Pure — the action gathers the facts, this only words them —
 * so the text can be tested without Discord or a database.
 *
 * Names are printed as plain text, never as mentions: these posts go out on
 * every pick and must not ping anyone (the webhook sender enforces that too).
 */
import type { DiscordMessage } from "../discord";
import { formatAmerican, formatAmericanLong, quoteParlay } from "./odds";

const APP_URL = process.env.APP_URL ?? "https://discordpickems.vercel.app";

/** Discord embed accent, matching the app's green. */
const ACCENT = 0x3ddc84;

export type PickAnnouncement = {
  week: number;
  /** Who picked, as a plain name ("David W"). */
  who: string;
  player: { name: string; pos: string; team: string; injury: string | null };
  /** The player they had before, when this is a change rather than a first pick. */
  previous: string | null;
  game: { awayAbbr: string; homeAbbr: string; kickoffAt: Date };
  /** DraftKings has an anytime-TD market up for him. Null when unknown. */
  line: boolean | null;
  /** His anytime-TD price (American), when known. */
  price: number | null;
  /** Every leg's price, this one included; null where unknown. */
  legs: (number | null)[];
  /** How many legs make a full ticket: one per member. */
  members: number;
  /** What the whole ticket is staked at. */
  stake: number;
};

export function pickAnnouncement(a: PickAnnouncement): DiscordMessage {
  const { player, game } = a;
  const title = a.previous
    ? `${a.who} switched their TD pick to ${player.name}`
    : `${a.who} locked in ${player.name} for the TD parlay`;

  const lines = [
    ...(a.previous ? [`~~${a.previous}~~ → **${player.name}**`] : []),
    `**Player:** ${player.name} · ${player.pos}, ${player.team}`,
    `**Matchup:** ${game.awayAbbr} @ ${game.homeAbbr} · ${kickoff(game.kickoffAt)}`,
    `**Anytime TD:** ${priceText(a.line, a.price)}`,
    ...(player.injury ? [`**Status:** ${player.injury}`] : []),
    "",
    ticketLine(a.legs, a.members, a.stake),
  ];

  return {
    embeds: [
      {
        title,
        description: lines.join("\n"),
        url: `${APP_URL}/touchdowns`,
        color: ACCENT,
        footer: { text: `Week ${a.week} TD parlay` },
        timestamp: new Date().toISOString(),
      },
    ],
    mentions: [],
    everyone: false,
  };
}

function priceText(line: boolean | null, price: number | null): string {
  if (price !== null) return `${formatAmerican(price)} (DraftKings)`;
  if (line === false) return "no DraftKings line right now — the book won't take this leg as it stands";
  return "price not in yet";
}

/** "7/12 TD picks are in · current odds +12,345 · total payout on $12: $1,493" */
function ticketLine(legs: (number | null)[], members: number, stake: number): string {
  const head = `**${legs.length}/${members}** TD picks are in`;
  const quote = quoteParlay(legs, stake);
  if (quote.priced === 0) return `${head} · no prices yet`;
  const payout = quote.payout.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const unpriced = quote.unpriced
    ? ` (${quote.unpriced} unpriced leg${quote.unpriced === 1 ? "" : "s"} left out)`
    : "";
  return (
    `${head} · current odds **${formatAmericanLong(quote.american)}**` +
    ` · total payout on $${stake}: **${payout}**${unpriced}`
  );
}

/** "Sun 1:00 PM ET" */
function kickoff(at: Date): string {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  return `${text} ET`;
}
