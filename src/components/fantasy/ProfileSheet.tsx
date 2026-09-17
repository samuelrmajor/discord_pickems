"use client";

import { useEffect } from "react";
import type { ProfileCard, ProfileRosters, RosterLine } from "@/lib/fantasy/profiles";

type Props = {
  profile: ProfileCard | null;
  /** Null while the lazy roster fetch is still in flight. */
  rosters: ProfileRosters | null;
  rostersFailed: boolean;
  onClose: () => void;
};

const POSITION_TINT: Record<string, string> = {
  QB: "text-[#ff7b9c]",
  RB: "text-[#4ecdc4]",
  WR: "text-[#5aa9ff]",
  TE: "text-[#ffc857]",
  K: "text-[#c58cff]",
  DEF: "text-[#9aa8bb]",
};

function pts(n: number): string {
  return n.toFixed(1);
}

/**
 * Full-screen panel with one manager's fantasy profile.
 *
 * Full screen rather than a partial sheet: the rosters are long enough to need
 * their own scroll, and a sheet that scrolls internally reads as if it should
 * also be draggable by its edge. One explicit close button, no gesture to
 * discover.
 */
export default function ProfileSheet({ profile, rosters, rostersFailed, onClose }: Props) {
  // Escape is free to support and costs nothing on touch.
  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profile, onClose]);

  if (!profile) return null;
  const record = `${profile.wins}-${profile.losses}${profile.ties ? `-${profile.ties}` : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]
                 [animation:sheet-up_220ms_cubic-bezier(0.22,1,0.36,1)]"
      role="dialog"
      aria-modal="true"
      aria-label={`${profile.realName} profile`}
    >
      {/* The overlay sits outside <body>'s padding, so it owns its own insets. */}
      <header className="shrink-0 border-b border-[var(--line)] px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          {profile.avatarUrl ? (
            // Sleeper's CDN is not in the remote-image allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="h-12 w-12 shrink-0 rounded-xl bg-[var(--panel)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold leading-tight">{profile.teamName}</p>
            <p className="truncate text-[12px] text-[var(--muted)]">
              {profile.realName} &middot; @{profile.username}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[15px] font-bold tabular-nums">{record}</p>
            {profile.seed > 0 && (
              <p className="text-[10px] uppercase text-[var(--muted)]">#{profile.seed} seed</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                       bg-[var(--panel)] text-[15px] leading-none text-[var(--muted)]
                       active:scale-95 active:bg-[var(--panel-2)]"
          >
            &#10005;
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <div className="grid grid-cols-3 gap-2 px-4">
          <Stat label="Points for" value={pts(profile.pointsFor)} />
          <Stat label="Points against" value={pts(profile.pointsAgainst)} />
          <Stat
            label="Max possible"
            value={pts(profile.potentialPoints)}
            hint={profile.streak ? `${profile.streak} streak` : undefined}
          />
        </div>

        {profile.lastResult && (
          <div className="mt-2 px-4">
            <div className="flex items-center gap-2 rounded-xl bg-[var(--panel)] px-3 py-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px]
                            font-bold ${
                              profile.lastResult.outcome === "W"
                                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                : profile.lastResult.outcome === "L"
                                  ? "bg-[var(--loss)] text-[#2a0509]"
                                  : "bg-[var(--panel-2)] text-[var(--muted)]"
                            }`}
              >
                {profile.lastResult.outcome}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Week {profile.lastResult.week}
                </span>
                <span className="block truncate text-[12px]">
                  vs <span className="font-semibold">{profile.lastResult.opponent}</span>
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-bold tabular-nums">
                {pts(profile.lastResult.points)}
                <span className="px-1 text-[var(--muted)]">&ndash;</span>
                {pts(profile.lastResult.opponentPoints)}
              </span>
            </div>
          </div>
        )}

        {rosters ? (
          <>
            <Roster title="Starters" lines={rosters.starters} showPoints />
            <Roster title="Bench" lines={rosters.bench} />
          </>
        ) : (
          <RosterPlaceholder failed={rostersFailed} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[var(--panel)] px-2 py-2 text-center">
      <p className="text-[15px] font-bold tabular-nums leading-tight">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)]">
        {hint ?? label}
      </p>
    </div>
  );
}

function Roster({
  title,
  lines,
  showPoints = false,
}: {
  title: string;
  lines: RosterLine[];
  showPoints?: boolean;
}) {
  if (lines.length === 0) return null;
  return (
    <section className="mt-3 px-4">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      <ul className="overflow-hidden rounded-xl bg-[var(--panel)]">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-center gap-2 border-b border-[var(--line)] px-2.5 py-1.5 last:border-0"
          >
            <span
              className={`w-8 shrink-0 text-[10px] font-bold ${
                POSITION_TINT[line.position] ?? "text-[var(--muted)]"
              }`}
            >
              {line.position}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px]">{line.name}</span>
            {line.injury && (
              <span className="shrink-0 text-[9px] font-bold text-[var(--loss)]">
                {line.injury}
              </span>
            )}
            <span className="w-8 shrink-0 text-right text-[10px] text-[var(--muted)]">
              {line.team ?? "FA"}
            </span>
            {showPoints && (
              <span className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums">
                {line.points === null ? "—" : pts(line.points)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Stand-in for the roster lists while they load, sized so the sheet doesn't jump. */
function RosterPlaceholder({ failed }: { failed: boolean }) {
  if (failed) {
    return (
      <p className="mt-4 px-4 text-center text-[11px] text-[var(--muted)]">
        Couldn&apos;t load the roster.
      </p>
    );
  }
  return (
    <section className="mt-3 px-4" aria-busy="true">
      <div className="h-3 w-14 rounded bg-[var(--panel)]" />
      <ul className="mt-1 overflow-hidden rounded-xl bg-[var(--panel)]">
        {Array.from({ length: 9 }, (_, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-[var(--line)] px-2.5 py-1.5 last:border-0">
            <span className="h-2.5 w-7 rounded bg-[var(--panel-2)]" />
            <span className="h-2.5 flex-1 rounded bg-[var(--panel-2)]" />
          </li>
        ))}
      </ul>
    </section>
  );
}
