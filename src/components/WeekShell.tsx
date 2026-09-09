"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export type TabKey = "picks" | "results" | "parlay";

type Props = {
  user: string;
  week: number;
  weeks: number[];
  currentWeek: number;
  defaultTab: TabKey;
  pickedCount: number;
  gameCount: number;
  picks: ReactNode;
  results: ReactNode;
  parlay: ReactNode;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "picks", label: "Picks" },
  { key: "results", label: "Results" },
  { key: "parlay", label: "Parlay" },
];

export default function WeekShell({
  user,
  week,
  weeks,
  currentWeek,
  defaultTab,
  pickedCount,
  gameCount,
  picks,
  results,
  parlay,
}: Props) {
  const [tab, setTab] = useState<TabKey>(defaultTab);

  const first = weeks[0] ?? week;
  const last = weeks[weeks.length - 1] ?? week;
  const incomplete = pickedCount < gameCount;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg">
      <header className="border-b border-[var(--line)] bg-[var(--bg)]">
        <div className="flex items-center justify-between px-3 pt-3">
          <Link href="/login" className="text-xs text-[var(--muted)]">
            <span className="font-semibold capitalize text-[var(--text)]">
              {user.replace("_", " ")}
            </span>
            <span className="pl-1.5 opacity-70">switch</span>
          </Link>

          <div className="flex items-center gap-1">
            <WeekArrow to={week - 1} disabled={week <= first} label="Previous week">
              &lsaquo;
            </WeekArrow>
            <span className="min-w-[86px] text-center text-sm font-bold tabular-nums">
              Week {week}
              {week === currentWeek && (
                <span className="ml-1 align-middle text-[9px] font-semibold uppercase text-[var(--accent)]">
                  now
                </span>
              )}
            </span>
            <WeekArrow to={week + 1} disabled={week >= last} label="Next week">
              &rsaquo;
            </WeekArrow>
          </div>
        </div>

        <nav className="flex gap-1 px-3 py-2.5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition ${
                tab === t.key
                  ? "bg-[var(--panel-2)] text-[var(--text)]"
                  : "text-[var(--muted)] active:bg-[var(--panel)]"
              }`}
            >
              {t.label}
              {t.key === "picks" && incomplete && gameCount > 0 && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--warn)] align-middle" />
              )}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <div hidden={tab !== "picks"}>{picks}</div>
        <div hidden={tab !== "results"}>{results}</div>
        <div hidden={tab !== "parlay"}>{parlay}</div>
      </main>
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
    "flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel)] text-lg leading-none";

  if (disabled) {
    return (
      <span aria-hidden className={`${cls} opacity-30`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/week/${to}`} aria-label={label} className={`${cls} active:scale-95`}>
      {children}
    </Link>
  );
}
