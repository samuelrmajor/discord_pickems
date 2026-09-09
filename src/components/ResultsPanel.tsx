import type { GameVM } from "@/lib/view";
import type { StandingRow } from "@/lib/scoring";
import { groupByDay, timeLabel } from "@/lib/format";
import type { Side } from "@/lib/espn";

type Props = {
  week: number;
  currentUser: string;
  standings: StandingRow[];
  games: GameVM[];
  myPicks: Record<string, Side>;
  gradedCount: number;
};

export default function ResultsPanel({
  week,
  currentUser,
  standings,
  games,
  myPicks,
  gradedCount,
}: Props) {
  const groups = groupByDay(games, (g) => new Date(g.kickoffAt));
  const me = standings.find((s) => s.name === currentUser);

  return (
    <div className="pb-10">
      <section className="px-3 pt-3">
        <div className="flex items-baseline justify-between px-1 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">
            Week {week} standings
          </h2>
          <span className="text-[11px] text-[var(--muted)] tabular-nums">
            {gradedCount}/{games.length} final
          </span>
        </div>

        {gradedCount === 0 ? (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            No games have finished yet. Standings fill in as results come in.
          </p>
        ) : (
          <ol className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
            {standings.map((row) => (
              <li
                key={row.name}
                className={`flex items-center gap-3 border-b border-[var(--line)] px-3 py-2.5 last:border-b-0 ${
                  row.name === currentUser ? "bg-[var(--panel-2)]" : ""
                }`}
              >
                <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-[var(--muted)]">
                  {row.rank}
                </span>
                <span className="flex-1 truncate text-sm font-semibold capitalize">
                  {row.name.replace("_", " ")}
                  {row.name === currentUser && (
                    <span className="ml-1.5 text-[10px] font-normal text-[var(--accent)]">you</span>
                  )}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {row.wins}
                  <span className="text-[var(--muted)]">-</span>
                  {row.losses}
                </span>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)]">
                  {row.seasonWins}-{row.seasonLosses} yr
                </span>
              </li>
            ))}
          </ol>
        )}

        {me && gradedCount > 0 && (
          <p className="px-1 pt-2 text-[11px] text-[var(--muted)]">
            You are {me.wins}-{me.losses} this week, ranked #{me.rank} of {standings.length}.
          </p>
        )}
      </section>

      <section className="px-3 pt-6">
        <h2 className="px-1 pb-2 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">
          Games
        </h2>
        {groups.map((group) => (
          <div key={group.key} className="pb-3">
            <h3 className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)] opacity-70">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.items.map((game) => (
                <ResultCard key={game.id} game={game} myPick={myPicks[game.id] ?? null} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function ResultCard({ game, myPick }: { game: GameVM; myPick: Side | null }) {
  const decided = game.winner === "home" || game.winner === "away";
  const hit = decided && myPick !== null && myPick === game.winner;
  const miss = decided && myPick !== null && myPick !== game.winner;

  const badge = !myPick
    ? { text: "no pick", cls: "text-[var(--muted)]" }
    : hit
      ? { text: "correct", cls: "text-[var(--accent)]" }
      : miss
        ? { text: "wrong", cls: "text-[var(--loss)]" }
        : { text: `you: ${myPick === "home" ? game.homeAbbr : game.awayAbbr}`, cls: "text-[var(--muted)]" };

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] text-[var(--muted)]">
        <span>
          {game.status === "final"
            ? "Final"
            : game.status === "in_progress"
              ? game.statusDetail || "Live"
              : timeLabel(new Date(game.kickoffAt))}
        </span>
        <span className={`font-semibold ${badge.cls}`}>{badge.text}</span>
      </div>

      <div className="space-y-1">
        <TeamRow game={game} side="away" myPick={myPick} />
        <TeamRow game={game} side="home" myPick={myPick} />
      </div>

      {game.homeVotes !== null && game.awayVotes !== null && (
        <p className="px-1 pt-1.5 text-[10px] text-[var(--muted)]">
          Group split: {game.awayAbbr} {game.awayVotes} &middot; {game.homeAbbr} {game.homeVotes}
          {game.awayVotes === game.homeVotes && game.awayVotes > 0
            ? ` — tie, coin flip gave it to ${game.coinFlipAbbr}`
            : ""}
        </p>
      )}
    </div>
  );
}

function TeamRow({ game, side, myPick }: { game: GameVM; side: Side; myPick: Side | null }) {
  const abbr = side === "home" ? game.homeAbbr : game.awayAbbr;
  const logo = side === "home" ? game.homeLogo : game.awayLogo;
  const score = side === "home" ? game.homeScore : game.awayScore;
  const won = game.winner === side;
  const mine = myPick === side;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${
        won ? "bg-[var(--panel-2)]" : ""
      } ${won ? "" : "opacity-70"}`}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
      )}
      <span className="flex-1 text-sm font-bold">
        {abbr}
        {mine && <span className="ml-1.5 text-[10px] font-normal text-[var(--accent)]">your pick</span>}
      </span>
      {score !== null && game.status !== "scheduled" && (
        <span className="text-base font-bold tabular-nums">{score}</span>
      )}
    </div>
  );
}
