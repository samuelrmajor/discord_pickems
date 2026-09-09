import type { GameVM } from "@/lib/view";
import type { StandingRow } from "@/lib/scoring";
import { groupByDay, timeShort } from "@/lib/format";
import type { Side } from "@/lib/espn";

type Props = {
  currentUser: string;
  standings: StandingRow[];
  games: GameVM[];
  myPicks: Record<string, Side>;
  gradedCount: number;
};

export default function ResultsPanel({
  currentUser,
  standings,
  games,
  myPicks,
  gradedCount,
}: Props) {
  const groups = groupByDay(games, (g) => new Date(g.kickoffAt));

  return (
    <div className="pb-8">
      <section className="px-2 pt-2">
        <div className="flex items-baseline justify-between px-1 pb-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Standings
          </h2>
          <span className="text-[10px] tabular-nums text-[var(--muted)]">
            {gradedCount}/{games.length} final
          </span>
        </div>

        {gradedCount === 0 ? (
          <p className="rounded-lg bg-[var(--panel)] px-3 py-3 text-center text-[11px] text-[var(--muted)]">
            No games finished yet. Standings fill in as results come in.
          </p>
        ) : (
          <ol className="overflow-hidden rounded-lg bg-[var(--panel)]">
            {standings.map((row) => (
              <li
                key={row.name}
                className={`flex items-center gap-2 border-b border-[var(--line)] px-2 py-1 last:border-b-0 ${
                  row.name === currentUser ? "bg-[var(--panel-2)]" : ""
                }`}
              >
                <span className="w-4 shrink-0 text-center text-[10px] font-bold tabular-nums text-[var(--muted)]">
                  {row.rank}
                </span>
                <span className="flex-1 truncate text-[13px] font-semibold capitalize leading-tight">
                  {row.name.replace("_", " ")}
                </span>
                <span className="text-[13px] font-bold tabular-nums leading-tight">
                  {row.wins}
                  <span className="text-[var(--muted)]">-</span>
                  {row.losses}
                </span>
                <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-[var(--muted)]">
                  {row.seasonWins}-{row.seasonLosses}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="px-2 pt-3">
        {groups.map((group) => (
          <div key={group.key}>
            <h3 className="px-1 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {group.label}
            </h3>
            {group.items.map((game) => (
              <ResultRow key={game.id} game={game} myPick={myPicks[game.id] ?? null} />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function ResultRow({ game, myPick }: { game: GameVM; myPick: Side | null }) {
  const decided = game.winner === "home" || game.winner === "away";
  const hit = decided && myPick !== null && myPick === game.winner;
  const miss = decided && myPick !== null && myPick !== game.winner;

  const status =
    game.status === "final"
      ? "final"
      : game.status === "in_progress"
        ? "live"
        : timeShort(new Date(game.kickoffAt));

  const mark = hit
    ? { text: "✓", cls: "text-[var(--accent)]" }
    : miss
      ? { text: "✗", cls: "text-[var(--loss)]" }
      : { text: myPick ? "·" : "—", cls: "text-[var(--muted)]" };

  const tied =
    game.homeVotes !== null && game.awayVotes !== null && game.homeVotes === game.awayVotes;

  return (
    <div className="flex items-center gap-1.5 border-b border-[var(--line)] py-1 last:border-b-0">
      <span className="w-10 shrink-0 text-[10px] tabular-nums text-[var(--muted)]">{status}</span>

      <TeamCell game={game} side="away" myPick={myPick} />
      <TeamCell game={game} side="home" myPick={myPick} />

      <span className="w-12 shrink-0 text-right leading-[1.15]">
        <span className={`block text-[13px] font-bold ${mark.cls}`}>{mark.text}</span>
        {game.homeVotes !== null && game.awayVotes !== null && (
          <span
            className="block text-[9px] tabular-nums text-[var(--muted)]"
            title={
              tied
                ? `Group tied — coin flip gave the leg to ${game.coinFlipAbbr}`
                : `Group split: ${game.awayAbbr} ${game.awayVotes}, ${game.homeAbbr} ${game.homeVotes}`
            }
          >
            {game.awayVotes}-{game.homeVotes}
            {tied && game.awayVotes > 0 ? " tie" : ""}
          </span>
        )}
      </span>
    </div>
  );
}

function TeamCell({ game, side, myPick }: { game: GameVM; side: Side; myPick: Side | null }) {
  const abbr = side === "home" ? game.homeAbbr : game.awayAbbr;
  const logo = side === "home" ? game.homeLogo : game.awayLogo;
  const score = side === "home" ? game.homeScore : game.awayScore;
  const decided = game.winner === "home" || game.winner === "away";
  const won = game.winner === side;
  const mine = myPick === side;

  /**
   * Your pick is ringed, and once the game is decided the ring takes the
   * outcome's color. Marking it in a fixed accent color would paint a losing
   * pick green, which reads as "correct" at a glance.
   */
  const ring = !mine
    ? ""
    : !decided
      ? "bg-[var(--panel-2)] ring-1 ring-[var(--line)]"
      : won
        ? "bg-[var(--panel-2)] ring-1 ring-[var(--accent)]"
        : "bg-[var(--panel-2)] ring-1 ring-[var(--loss)]";

  return (
    <div className={`flex h-9 min-w-0 flex-1 items-center rounded-lg px-2 ${ring}`}>
      {/* Dim the contents, not the wrapper, so the ring stays crisp. */}
      <div
        className={`flex w-full min-w-0 items-center gap-1.5 ${
          decided && !won ? "opacity-50" : ""
        }`}
      >
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={18}
            height={18}
            className="h-[18px] w-[18px] shrink-0 object-contain"
          />
        )}
        <span className={`truncate text-[13px] leading-none ${won ? "font-bold" : "font-semibold"}`}>
          {abbr}
        </span>
        {score !== null && game.status !== "scheduled" && (
          <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums leading-none">
            {score}
          </span>
        )}
      </div>
    </div>
  );
}
