"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { clearPick, pickPlayer, previewPlayer } from "@/app/touchdowns/actions";
import { dayLabel, timeShort } from "@/lib/format";
import type { TdGameVM, TdLegVM, TdPlayerVM } from "@/lib/td/data";
import { formatAmerican, formatAmericanLong, nameKey, quoteParlay } from "@/lib/td/odds";
import { Chip, Headshot, PriceBadge, ResultPill, TeamLogo, display } from "./bits";
import TdParlay from "./TdParlay";

type Props = {
  user: string;
  week: number;
  weeks: number[];
  currentWeek: number;
  members: string[];
  stake: number;
  games: TdGameVM[];
  players: TdPlayerVM[];
  legs: TdLegVM[];
  pricesEnabled: boolean;
};

type TabKey = "pick" | "parlay";

const POSITIONS = ["All", "RB", "WR", "TE", "QB"] as const;
type PosFilter = (typeof POSITIONS)[number];

/** How many search rows to render. The pool is ~500 players; nobody scrolls that. */
const RESULT_LIMIT = 40;

export default function TdShell({
  user,
  week,
  weeks,
  currentWeek,
  members,
  stake,
  games,
  players,
  legs,
  pricesEnabled,
}: Props) {
  const router = useRouter();
  const mine = legs.find((l) => l.user === user) ?? null;
  const openGames = games.filter((g) => !g.locked);

  /**
   * Land where there's something to do: on Pick while you still owe a pick
   * that can be made, otherwise on Parlay once any leg is underway — which is
   * every Sunday, for everyone, without a tap.
   */
  const defaultTab: TabKey =
    !mine && openGames.length > 0
      ? "pick"
      : legs.some((l) => l.locked) || openGames.length === 0
        ? "parlay"
        : "pick";
  const [tab, setTab] = useState<TabKey>(defaultTab);

  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<PosFilter>("All");
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [selected, setSelected] = useState<TdPlayerVM | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  /**
   * Price sheets fetched by previews this session, by game. They layer over
   * the server's prices so the list fills in as people look around, without a
   * page refresh per tap.
   */
  const [sheets, setSheets] = useState<Record<string, Record<string, number>>>({});

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const logos = useMemo(() => {
    const out = new Map<string, string | null>();
    for (const g of games) {
      out.set(g.homeAbbr, g.homeLogo);
      out.set(g.awayAbbr, g.awayLogo);
    }
    return out;
  }, [games]);
  const logoOf = (team: string) => logos.get(team) ?? null;

  const priceOf = (gameId: string, name: string, fallback: number | null) =>
    sheets[gameId]?.[nameKey(name)] ?? fallback;

  const mineLocked = mine?.locked ?? false;
  const legPrices = legs.map((l) => priceOf(l.gameId, l.name, l.price));
  const quote = quoteParlay(legPrices, stake);
  const noLine = legs.filter((l) => l.line === false).length;

  // ~500 players; filtering them every render is cheaper than memoizing it.
  const q = nameKey(query);
  const rank = (p: TdPlayerVM) => (p.line === true ? 0 : p.line === null ? 1 : 2);
  const isTaken = (p: TdPlayerVM) => p.takenBy !== null && p.takenBy !== user;
  const results = players
    .filter(
      (p) =>
        (pos === "All" || p.pos === pos || (pos === "RB" && p.pos === "FB")) &&
        (gameFilter === "all" || p.gameId === gameFilter) &&
        (!q || nameKey(p.name).includes(q) || p.team.toLowerCase() === q)
    )
    .map((p) => ({ ...p, price: priceOf(p.gameId, p.name, p.price) }))
    // Still available first, then bettable, then shortest price, so the
    // obvious candidates lead and anyone already picked sinks, greyed out.
    .sort(
      (a, b) =>
        Number(isTaken(a)) - Number(isTaken(b)) ||
        rank(a) - rank(b) ||
        (a.price ?? 99999) - (b.price ?? 99999) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, RESULT_LIMIT);

  const copy = async () => {
    const lines = [
      `Week ${week} anytime TD parlay (${legs.length} legs` +
        (quote.priced ? `, ${formatAmericanLong(quote.american)}` : "") +
        ")",
      ...legs.map((l, i) => {
        const price = legPrices[i];
        return `${l.name} (${l.team} ${l.pos})${price !== null ? ` ${formatAmerican(price)}` : ""} - ${display(l.user)}`;
      }),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const onLockIn = (player: TdPlayerVM) => {
    setError(null);
    startTransition(async () => {
      const res = await pickPlayer(week, player.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelected(null);
      setQuery("");
      router.refresh();
    });
  };

  const onClear = () => {
    setError(null);
    startTransition(async () => {
      const res = await clearPick(week);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const first = weeks[0] ?? week;
  const last = weeks[weeks.length - 1] ?? week;
  const tabs: { key: TabKey; label: string; dot: boolean }[] = [
    { key: "pick", label: "Pick", dot: !mine && openGames.length > 0 },
    { key: "parlay", label: "Parlay", dot: legs.some((l) => l.result === "live") },
  ];

  return (
    // Parlay is a one-screen board: pinned to the viewport so all twelve legs fit
    // without scrolling. Pick is a long search list and scrolls as usual.
    <div
      className={`mx-auto flex w-full max-w-lg flex-col ${
        tab === "parlay" ? "h-dvh overflow-hidden" : "min-h-dvh pb-10"
      }`}
    >
      <header className="shrink-0 border-b border-[var(--line)] bg-[var(--bg)]">
        <div className="flex items-center justify-between px-2 pt-1.5">
          <div className="flex items-center gap-1">
            <Link
              href="/"
              aria-label="All modules"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--panel)]
                         text-base leading-none active:scale-95"
            >
              &lsaquo;
            </Link>
            <form action={logout}>
              <button type="submit" className="px-1 text-[11px] text-[var(--muted)]">
                <span className="font-semibold text-[var(--text)]">{display(user)}</span>
                <span className="pl-1 opacity-70">switch</span>
              </button>
            </form>
          </div>
          <div className="flex items-center gap-1">
            <WeekArrow to={week - 1} disabled={week <= first} label="Previous week">
              &lsaquo;
            </WeekArrow>
            <span className="min-w-[76px] text-center text-[13px] font-bold tabular-nums">
              Week {week}
              {week === currentWeek && (
                <span className="ml-1 align-middle text-[8px] font-semibold uppercase text-[var(--accent)]">
                  now
                </span>
              )}
            </span>
            <WeekArrow to={week + 1} disabled={week >= last} label="Next week">
              &rsaquo;
            </WeekArrow>
          </div>
        </div>

        <nav className="flex gap-1 px-2 pb-1.5 pt-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`h-8 flex-1 rounded-lg text-[13px] font-semibold transition ${
                tab === t.key
                  ? "bg-[var(--panel-2)] text-[var(--text)]"
                  : "text-[var(--muted)] active:bg-[var(--panel)]"
              }`}
            >
              {t.label}
              {t.dot && (
                <span
                  className={`ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                    t.key === "pick" ? "bg-[var(--warn)]" : "animate-pulse bg-[var(--warn)]"
                  }`}
                />
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
      <div hidden={tab !== "parlay"} className="min-h-0 flex-1">
        <TdParlay
          user={user}
          members={members}
          legs={legs}
          games={games}
          legPrices={legPrices}
          stake={stake}
          picksOpen={openGames.length > 0}
          logoOf={logoOf}
        />
      </div>

      <div hidden={tab !== "pick"} className="px-2 pt-2">
        {/* ------------------------------------------------ parlay summary */}
        <section className="flex items-center gap-2 rounded-lg bg-[var(--panel)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight">
              {legs.length}/{members.length} legs
              {quote.priced > 0 && (
                <span className="ml-2 tabular-nums text-[var(--accent)]">
                  {formatAmericanLong(quote.american)}
                </span>
              )}
            </p>
            <p className="text-[10px] leading-tight text-[var(--muted)]">
              {quote.priced > 0 ? (
                <>
                  ${stake} pays{" "}
                  <span className="font-semibold text-[var(--text)]">
                    ${quote.payout.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                  {quote.unpriced > 0 &&
                    ` · ${quote.unpriced} leg${quote.unpriced === 1 ? "" : "s"} unpriced`}
                </>
              ) : pricesEnabled ? (
                "No prices yet — open a player to fetch their game's prices"
              ) : (
                "Prices are off (no ODDS_API_KEY); line availability still works"
              )}
            </p>
          </div>
          <button
            onClick={copy}
            disabled={legs.length === 0}
            className="h-8 shrink-0 rounded-lg bg-[var(--panel-2)] px-3 text-[11px] font-semibold
                       active:scale-[0.97] disabled:opacity-40"
          >
            {copied ? "Copied" : "Copy legs"}
          </button>
        </section>

        {noLine > 0 && (
          <p className="px-1 pt-1.5 text-[10px] text-[var(--warn)]">
            {noLine} pick{noLine === 1 ? " has" : "s have"} no DraftKings anytime-TD line right now
            {" "}— the book won&apos;t take {noLine === 1 ? "that leg" : "those legs"}.
          </p>
        )}

        {/* ------------------------------------------------ your leg */}
        <section className="mt-3">
          <h2 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Your pick
          </h2>
          {mine ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-2.5 py-2">
              <Headshot athleteId={mine.athleteId} logo={logoOf(mine.team)} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{mine.name}</p>
                <p className="truncate text-[10px] text-[var(--muted)]">
                  <TeamLogo logo={logoOf(mine.team)} size={11} /> {mine.team} {mine.pos} ·{" "}
                  {mine.shortName} · {dayLabel(new Date(mine.kickoffAt)).split(",")[0]}{" "}
                  {timeShort(new Date(mine.kickoffAt))}
                </p>
              </div>
              <PriceBadge line={mine.line} price={priceOf(mine.gameId, mine.name, mine.price)} />
              {mineLocked ? (
                <ResultPill result={mine.result} tds={mine.tds} />
              ) : (
                <button
                  onClick={onClear}
                  disabled={pending}
                  className="h-7 rounded-lg bg-[var(--panel-2)] px-2 text-[10px] font-semibold
                             text-[var(--muted)] active:scale-95"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-2 text-[12px] text-[var(--muted)]">
              {openGames.length ? "No pick yet — search for a player below." : "No pick this week."}
            </p>
          )}
          {error && !selected && <p className="px-1 pt-1 text-[11px] text-[var(--loss)]">{error}</p>}
        </section>

        {/* ------------------------------------------------ search */}
        {openGames.length > 0 && !mineLocked && (
          <section className="mt-3">
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder={mine ? "Search to switch your pick…" : "Search players or a team (MIN)…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3
                         text-[14px] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
            />
            <div className="no-scrollbar mt-1.5 flex gap-1 overflow-x-auto">
              {POSITIONS.map((p) => (
                <Chip key={p} active={pos === p} onClick={() => setPos(p)}>
                  {p}
                </Chip>
              ))}
              <select
                value={gameFilter}
                onChange={(e) => setGameFilter(e.target.value)}
                aria-label="Filter by game"
                className="h-7 shrink-0 rounded-lg bg-[var(--panel)] px-2 text-[11px] font-semibold text-[var(--muted)]"
              >
                <option value="all">All games</option>
                {openGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.shortName}
                  </option>
                ))}
              </select>
            </div>

            <ul className="mt-1">
              {results.map((p) => {
                const game = gameById.get(p.gameId);
                const locked = game?.locked ?? true;
                const taken = isTaken(p);
                const isMine = mine?.athleteId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      disabled={locked || taken || isMine}
                      onClick={() => {
                        setError(null);
                        setSelected(p);
                      }}
                      className={`flex w-full items-center gap-2.5 border-b border-[var(--line)] py-1.5 text-left
                                 active:bg-[var(--panel)] disabled:opacity-45 ${taken ? "grayscale" : ""}`}
                    >
                      <Headshot athleteId={p.id} logo={logoOf(p.team)} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                          {p.name}
                          {p.injury && (
                            <span className="ml-1.5 text-[9px] font-semibold uppercase text-[var(--loss)]">
                              {p.injury}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] text-[var(--muted)]">
                          <TeamLogo logo={logoOf(p.team)} size={11} /> {p.team} {p.pos} vs {p.opp}
                          {game &&
                            ` · ${dayLabel(new Date(game.kickoffAt)).split(",")[0]} ${timeShort(new Date(game.kickoffAt))}`}
                          {taken && ` · picked by ${display(p.takenBy!)}`}
                          {isMine && " · your pick"}
                        </span>
                      </span>
                      {taken ? (
                        <span className="w-12 shrink-0 text-right text-[9px] font-semibold uppercase text-[var(--muted)]">
                          taken
                        </span>
                      ) : (
                        <PriceBadge line={p.line} price={p.price} />
                      )}
                    </button>
                  </li>
                );
              })}
              {results.length === 0 && (
                <li className="py-6 text-center text-[11px] text-[var(--muted)]">No players match.</li>
              )}
            </ul>
          </section>
        )}

        <p className="px-1 pt-4 text-[10px] leading-relaxed text-[var(--muted)]">
          One player each, no doubling up. A pick locks when its game kicks off. Lines are
          DraftKings&apos; anytime-TD market via ESPN; a player who doesn&apos;t suit up is void, the
          way the book settles it. Everyone&apos;s picks are on Parlay.
        </p>
      </div>
      </main>

      {selected && (
        <PreviewSheet
          key={selected.id}
          week={week}
          player={selected}
          logo={logoOf(selected.team)}
          game={gameById.get(selected.gameId) ?? null}
          replacing={mine}
          legPrices={legs
            .filter((l) => l.user !== user)
            .map((l) => priceOf(l.gameId, l.name, l.price))}
          stake={stake}
          pricesEnabled={pricesEnabled}
          pending={pending}
          error={error}
          onSheet={(gameId, sheet) => setSheets((prev) => ({ ...prev, [gameId]: sheet }))}
          onConfirm={() => onLockIn(selected)}
          onClose={() => {
            setSelected(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- preview

function PreviewSheet({
  week,
  player,
  logo,
  game,
  replacing,
  legPrices,
  stake,
  pricesEnabled,
  pending,
  error,
  onSheet,
  onConfirm,
  onClose,
}: {
  week: number;
  player: TdPlayerVM;
  logo: string | null;
  game: TdGameVM | null;
  replacing: TdLegVM | null;
  /** Everyone else's leg prices — the parlay this pick would join. */
  legPrices: (number | null)[];
  stake: number;
  pricesEnabled: boolean;
  pending: boolean;
  error: string | null;
  onSheet: (gameId: string, sheet: Record<string, number>) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState<number | null>(player.price);
  const [loading, setLoading] = useState(pricesEnabled);

  // Fetch the game's prices when the sheet opens. The sheet is keyed by player,
  // so this runs once per player looked at; the server caps it at one paid
  // request per game per hour however often people look.
  useEffect(() => {
    if (!pricesEnabled) return;
    let live = true;
    previewPlayer(week, player.id)
      .then((res) => {
        if (!live || !res.ok) return;
        setPrice(res.price);
        onSheet(player.gameId, res.prices);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // Once per open sheet; `onSheet` is a fresh closure every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, player.id, pricesEnabled]);

  const before = quoteParlay(legPrices, stake);
  const after = quoteParlay([...legPrices, price], stake);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
        style={{ animation: "fade-in 150ms ease-out" }}
      />
      <div
        className="relative w-full max-w-lg rounded-t-2xl border-t border-[var(--line)] bg-[var(--panel)] px-4 pb-6 pt-3"
        style={{
          animation: "sheet-up 200ms ease-out",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line)]" />
        <div className="flex items-center gap-3">
          <Headshot athleteId={player.id} logo={logo} size={64} />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-bold leading-tight">{player.name}</p>
            <p className="text-[11px] text-[var(--muted)]">
              <TeamLogo logo={logo} size={12} /> {player.team} {player.pos} vs {player.opp}
            </p>
            {game && (
              <p className="text-[11px] text-[var(--muted)]">
                {dayLabel(new Date(game.kickoffAt))} {timeShort(new Date(game.kickoffAt))}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Anytime TD">
            {loading ? (
              <span className="text-[var(--muted)]">…</span>
            ) : price !== null ? (
              formatAmerican(price)
            ) : player.line === false ? (
              <span className="text-[var(--warn)]">No line</span>
            ) : (
              <span className="text-[var(--muted)]">{pricesEnabled ? "Unpriced" : "—"}</span>
            )}
          </Stat>
          <Stat label="Parlay with him">
            {loading ? (
              <span className="text-[var(--muted)]">…</span>
            ) : after.priced > 0 ? (
              <>
                {formatAmericanLong(after.american)}
                {before.priced > 0 && price !== null && (
                  <span className="block text-[10px] font-normal text-[var(--muted)]">
                    from {formatAmericanLong(before.american)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[var(--muted)]">—</span>
            )}
          </Stat>
        </div>

        {player.line === false && (
          <p className="mt-2 text-[11px] text-[var(--warn)]">
            DraftKings has no anytime-TD line for him right now. It may go up later, but as of now
            the parlay can&apos;t include this leg.
          </p>
        )}
        {player.line === null && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Couldn&apos;t check this game&apos;s lines — worth confirming in the app.
          </p>
        )}
        {player.injury && (
          <p className="mt-2 text-[11px] text-[var(--loss)]">Listed {player.injury}.</p>
        )}
        {replacing && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">Replaces {replacing.name}.</p>
        )}
        {error && <p className="mt-2 text-[11px] text-[var(--loss)]">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-[var(--panel-2)] text-[13px] font-semibold active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="h-11 flex-[2] rounded-xl bg-[var(--accent)] text-[13px] font-bold text-[var(--accent-ink)]
                       active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? "Saving…" : replacing ? "Switch to him" : "Lock him in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bits

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--panel-2)] px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="text-[16px] font-bold tabular-nums">{children}</p>
    </div>
  );
}

function WeekArrow({
  to,
  disabled,
  label,
  children,
}: {
  to: number;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const cls =
    "flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--panel)] text-base leading-none";
  if (disabled) {
    return (
      <span aria-hidden className={`${cls} opacity-30`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/touchdowns?week=${to}`} aria-label={label} className={`${cls} active:scale-95`}>
      {children}
    </Link>
  );
}
