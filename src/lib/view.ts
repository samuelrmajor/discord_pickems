import type { GameRow } from "@/db/schema";
import type { Side } from "./espn";
import type { ConsensusLeg } from "./scoring";

/** Everything a game card needs, flattened for the client boundary. */
export type GameVM = {
  id: string;
  shortName: string;
  kickoffAt: string;
  homeAbbr: string;
  homeName: string;
  homeLogo: string | null;
  awayAbbr: string;
  awayName: string;
  awayLogo: string | null;
  favorite: Side | null;
  spread: number | null;
  coinFlip: Side;
  coinFlipAbbr: string;
  status: "scheduled" | "in_progress" | "final";
  statusDetail: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: Side | "push" | null;
  locked: boolean;
  /** Group vote counts, only revealed once the game is locked. */
  homeVotes: number | null;
  awayVotes: number | null;
};

export function toGameVM(
  game: GameRow,
  opts: { homeVotes: number; awayVotes: number }
): GameVM {
  const locked = game.kickoffAt.getTime() <= Date.now();
  const coinFlip = (game.coinFlip === "home" ? "home" : "away") as Side;
  return {
    id: game.id,
    shortName: game.shortName,
    kickoffAt: game.kickoffAt.toISOString(),
    homeAbbr: game.homeAbbr,
    homeName: game.homeName,
    homeLogo: game.homeLogo,
    awayAbbr: game.awayAbbr,
    awayName: game.awayName,
    awayLogo: game.awayLogo,
    favorite: game.favorite === "home" || game.favorite === "away" ? game.favorite : null,
    spread: game.spread,
    coinFlip,
    coinFlipAbbr: coinFlip === "home" ? game.homeAbbr : game.awayAbbr,
    status: game.status as GameVM["status"],
    statusDetail: game.statusDetail,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    winner:
      game.winner === "home" || game.winner === "away" || game.winner === "push"
        ? game.winner
        : null,
    locked,
    // Hiding the split until kickoff keeps people from just following the herd.
    homeVotes: locked ? opts.homeVotes : null,
    awayVotes: locked ? opts.awayVotes : null,
  };
}

export type LegVM = {
  gameId: string;
  shortName: string;
  side: Side;
  sideAbbr: string;
  sideName: string;
  homeVotes: number;
  awayVotes: number;
  totalVotes: number;
  decidedByCoinFlip: boolean;
  result: "win" | "loss" | "push" | null;
  spread: number | null;
  isFavorite: boolean;
  kickoffAt: string;
};

export function toLegVM(leg: ConsensusLeg): LegVM {
  const { game, side } = leg;
  return {
    gameId: game.id,
    shortName: game.shortName,
    side,
    sideAbbr: side === "home" ? game.homeAbbr : game.awayAbbr,
    sideName: side === "home" ? game.homeName : game.awayName,
    homeVotes: leg.homeVotes,
    awayVotes: leg.awayVotes,
    totalVotes: leg.totalVotes,
    decidedByCoinFlip: leg.decidedByCoinFlip,
    result: leg.result,
    spread: game.spread,
    isFavorite: game.favorite === side,
    kickoffAt: game.kickoffAt.toISOString(),
  };
}
