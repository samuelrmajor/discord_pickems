"use client";

import { useState, type ReactNode } from "react";
import { formatAmerican, type LegResult } from "@/lib/td/odds";

export const display = (name: string) =>
  name
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");

/**
 * ESPN headshots live at a fixed URL per athlete id, so nothing has to be
 * stored for them. The combiner endpoint serves a small crop instead of the
 * full 350px image — forty of those in a search list adds up on a phone.
 */
function headshotUrl(athleteId: string): string {
  return (
    "https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/" +
    `${athleteId}.png&w=96&h=70&scale=crop&cquality=40`
  );
}

/**
 * A player's face, over his team's logo. Plenty of depth players have no
 * headshot, so a failed load falls back to the logo alone rather than a
 * broken-image icon.
 */
export function Headshot({
  athleteId,
  logo,
  size = 40,
}: {
  athleteId: string;
  logo: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const badge = Math.round(size * 0.42);

  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-full bg-[var(--panel-2)]"
      style={{ width: size, height: size }}
    >
      {failed ? (
        logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-contain p-1.5" />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headshotUrl(athleteId)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-top"
        />
      )}
      {!failed && logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="absolute bottom-0 right-0 rounded-full bg-[var(--panel)] p-[1px]"
          style={{ width: badge, height: badge }}
        />
      )}
    </span>
  );
}

export function TeamLogo({ logo, size = 14 }: { logo: string | null; size?: number }) {
  if (!logo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo}
      alt=""
      width={size}
      height={size}
      className="inline-block shrink-0 object-contain align-[-2px]"
      style={{ width: size, height: size }}
    />
  );
}

export function PriceBadge({ line, price }: { line: boolean | null; price: number | null }) {
  if (price !== null) {
    return (
      <span className="w-12 shrink-0 text-right text-[12px] font-bold tabular-nums">
        {formatAmerican(price)}
      </span>
    );
  }
  if (line === false) {
    return (
      <span className="w-12 shrink-0 text-right text-[9px] font-semibold uppercase text-[var(--warn)]">
        no line
      </span>
    );
  }
  return (
    <span className="w-12 shrink-0 text-right text-[9px] font-semibold uppercase text-[var(--muted)]">
      {line ? "line" : "?"}
    </span>
  );
}

/**
 * A leg is pending until it hits or fails. "live" is still pending — the game
 * is on and he hasn't scored — and only adds the pulsing dot.
 */
const RESULT_STYLE: Record<LegResult, { label: string; cls: string }> = {
  hit: { label: "Hit", cls: "bg-[var(--accent)] text-[var(--accent-ink)]" },
  miss: { label: "Failed", cls: "bg-[var(--loss)]/15 text-[var(--loss)]" },
  void: { label: "Void", cls: "bg-[var(--panel-2)] text-[var(--muted)]" },
  live: { label: "Pending", cls: "bg-[var(--warn)]/15 text-[var(--warn)]" },
  pending: { label: "Pending", cls: "bg-[var(--panel-2)] text-[var(--muted)]" },
};

/** The leg's verdict as a pill. `tds` turns a hit into "Hit ×2" when he has more than one. */
export function ResultPill({ result, tds = 0 }: { result: LegResult; tds?: number }) {
  const { label, cls } = RESULT_STYLE[result];
  return (
    <span
      className={`inline-flex h-5 min-w-[52px] shrink-0 items-center justify-center rounded-md px-1.5
                  text-[10px] font-bold uppercase ${cls}`}
    >
      {result === "live" && (
        <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--warn)]" />
      )}
      {result === "hit" && tds > 1 ? `${label} ×${tds}` : label}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 shrink-0 rounded-lg px-2.5 text-[11px] font-semibold transition ${
        active ? "bg-[var(--panel-2)] text-[var(--text)]" : "bg-[var(--panel)] text-[var(--muted)]"
      }`}
    >
      {children}
    </button>
  );
}
