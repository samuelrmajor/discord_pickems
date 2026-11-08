/**
 * Price math for the anytime-touchdown parlay. Pure — no I/O — so the rules
 * that turn twelve prices into one payout can be checked without a database.
 */

/** American odds -> decimal. +250 -> 3.5, -150 -> 1.667. */
export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

/** Decimal odds -> American, rounded the way a book quotes it. */
export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return 0;
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

/** "+250" / "-150". */
export function formatAmerican(american: number): string {
  return american > 0 ? `+${american}` : String(american);
}

/** "+12,345" — a twelve-leg parlay runs well past four digits. */
export function formatAmericanLong(american: number): string {
  const body = Math.abs(american).toLocaleString("en-US");
  return american > 0 ? `+${body}` : `-${body}`;
}

export type ParlayQuote = {
  /** Legs that had a price and went into the number. */
  priced: number;
  /** Legs left out because no price is known. */
  unpriced: number;
  decimal: number;
  american: number;
  /** What the stake returns if every priced leg hits, stake included. */
  payout: number;
};

/**
 * Combine leg prices into one parlay quote. Unpriced legs are left out rather
 * than guessed at, and reported so the screen can say the number is partial.
 */
export function quoteParlay(prices: (number | null)[], stake: number): ParlayQuote {
  let decimal = 1;
  let priced = 0;
  for (const price of prices) {
    if (price === null) continue;
    decimal *= americanToDecimal(price);
    priced += 1;
  }
  return {
    priced,
    unpriced: prices.length - priced,
    decimal,
    american: priced ? decimalToAmerican(decimal) : 0,
    payout: priced ? stake * decimal : 0,
  };
}

/**
 * Normalize a player's name for matching across feeds.
 *
 * ESPN and the odds feed disagree on punctuation and suffixes ("Aaron Jones
 * Sr." vs "Aaron Jones", "D.J. Moore" vs "DJ Moore"), and neither shares an
 * id with the other, so a name with those stripped is the join key.
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type LegResult = "hit" | "miss" | "void" | "live" | "pending";

/**
 * Grade one leg from its game's state and that game's box score.
 *
 * A touchdown is final the moment it is scored, so a hit shows up live. A
 * miss waits for the final whistle. A player absent from a final box score
 * never took the field, which a book settles as void — the parlay drops the
 * leg and pays on the rest, so it must not read as a miss.
 */
export function gradeLeg(
  status: "scheduled" | "in_progress" | "final",
  box: { scorers: string[]; appeared: string[] } | null,
  athleteId: string
): LegResult {
  if (box?.scorers.includes(athleteId)) return "hit";
  if (status === "scheduled") return "pending";
  if (status === "in_progress") return "live";
  // Final, but the box score hasn't been read yet — don't call it either way.
  if (!box) return "pending";
  return box.appeared.includes(athleteId) ? "miss" : "void";
}
