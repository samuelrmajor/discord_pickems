"use client";

import { useEffect } from "react";
import type { Profile, RosterLine } from "@/lib/fantasy/snapshot";

type Props = { profile: Profile | null; onClose: () => void };

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

/** Bottom sheet with one manager's fantasy profile. */
export default function ProfileSheet({ profile, onClose }: Props) {
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close profile"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 [animation:fade-in_150ms_ease]"
      />

      <div
        className="relative max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-[var(--line)]
                   bg-[var(--bg)] pb-[max(1rem,env(safe-area-inset-bottom))]
                   [animation:sheet-up_220ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="sticky top-0 z-10 bg-[var(--bg)] px-4 pb-3 pt-2">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-[var(--line)]" />

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
          </div>
        </div>

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

        <Roster title="Starters" lines={profile.starters} showPoints />
        <Roster title="Bench" lines={profile.bench} />
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
