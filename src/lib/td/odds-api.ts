/**
 * Anytime-TD prices, from The Odds API (the-odds-api.com).
 *
 * ESPN publishes which players have a DraftKings anytime-TD line but not what
 * it pays, and DraftKings refuses requests from outside a browser, so prices
 * need a real odds feed. This one has a free tier (500 credits a month) and
 * charges one credit per game per refresh for this market, so callers must
 * cache aggressively — see `PRICE_TTL_MS` in `data`.
 *
 * Optional: with no `ODDS_API_KEY` set, every call here reports "no prices",
 * and the module still works on ESPN's line availability alone.
 */

const BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";
const MARKET = "player_anytime_td";
const BOOK = "draftkings";

type Json = Record<string, unknown>;

export function oddsApiConfigured(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}

export type OddsEvent = { id: string; homeTeam: string; awayTeam: string; commenceTime: string };

/** Every upcoming NFL event and its id. This listing costs no credits. */
export async function fetchOddsEvents(): Promise<OddsEvent[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return [];
  const res = await fetch(`${BASE}/events?apiKey=${key}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Odds API ${res.status} listing events`);
  const rows = (await res.json()) as Json[];
  return rows.map((r) => ({
    id: String(r.id),
    homeTeam: String(r.home_team),
    awayTeam: String(r.away_team),
    commenceTime: String(r.commence_time),
  }));
}

/**
 * The odds feed has its own event ids, so a game is found by its home team
 * and kickoff. Team names are the full "Minnesota Vikings" form on both sides;
 * kickoff only has to be close, since a flexed game moves by hours, not days.
 */
export function matchEvent(
  events: OddsEvent[],
  game: { homeName: string; kickoffAt: Date }
): OddsEvent | null {
  const window = 36 * 60 * 60 * 1000;
  return (
    events.find(
      (e) =>
        e.homeTeam === game.homeName &&
        Math.abs(new Date(e.commenceTime).getTime() - game.kickoffAt.getTime()) < window
    ) ?? null
  );
}

export type PriceSheet = {
  /** Player name as the book writes it -> American price. */
  prices: Record<string, number>;
  /** Credits left this month, from the response header, when it was sent. */
  remaining: number | null;
};

/** One game's DraftKings anytime-TD prices. Costs one credit. */
export async function fetchAnytimePrices(eventId: string): Promise<PriceSheet> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { prices: {}, remaining: null };

  const url =
    `${BASE}/events/${eventId}/odds?apiKey=${key}` +
    `&regions=us&markets=${MARKET}&bookmakers=${BOOK}&oddsFormat=american`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Odds API ${res.status} for event ${eventId}`);

  const remainingHeader = res.headers.get("x-requests-remaining");
  const remaining = remainingHeader === null ? null : Number(remainingHeader);

  const body = (await res.json()) as Json;
  const prices: Record<string, number> = {};
  for (const book of (body.bookmakers as Json[] | undefined) ?? []) {
    if (book.key !== BOOK) continue;
    for (const market of (book.markets as Json[] | undefined) ?? []) {
      if (market.key !== MARKET) continue;
      for (const outcome of (market.outcomes as Json[] | undefined) ?? []) {
        // The player is in `description`; `name` is the side of the yes/no
        // prop. Only the "yes" side is the bet.
        const side = String(outcome.name ?? "").toLowerCase();
        if (side === "no" || side === "under") continue;
        const player = typeof outcome.description === "string" ? outcome.description : null;
        const price = Number(outcome.price);
        if (player && Number.isFinite(price)) prices[player] = price;
      }
    }
  }
  return { prices, remaining: Number.isFinite(remaining) ? remaining : null };
}
