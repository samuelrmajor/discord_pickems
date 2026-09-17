"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfileCard } from "@/lib/fantasy/profiles";

type Props = {
  order: string[];
  profiles: Map<string, ProfileCard>;
  disabled: boolean;
  onReorder: (order: string[]) => void;
  onOpenProfile: (name: string) => void;
};

type Drag = {
  pointerId: number;
  /** Index the row started at, which is also its index in the DOM. */
  from: number;
  /** Index it would land on if released now. */
  over: number;
  startY: number;
  dy: number;
  /** Distance between two rows' tops, measured when the drag began. */
  step: number;
};

/**
 * The row that was dropped, still offset from its new slot by however far the
 * finger was from a clean row boundary. See `end` for why this exists.
 */
type Settle = { name: string; offset: number; running: boolean };

const SETTLE_MS = 180;
const SHIFT_MS = 160;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/**
 * Drag-to-reorder list sized to exactly fill its parent — twelve rows, no
 * scrolling, on a phone.
 *
 * DOM order stays fixed during a drag and rows are displaced with `transform`
 * instead: re-keying the list on every crossing would cancel the CSS
 * transitions and make the board jump. The committed order is handed up on
 * release.
 */
export default function RankBoard({
  order,
  profiles,
  disabled,
  onReorder,
  onOpenProfile,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settle, setSettle] = useState<Settle | null>(null);

  /**
   * Run the drop animation in two frames: paint once at the leftover offset
   * with no transition, then transition to zero. Committing the order moves the
   * row to a new layout slot instantly, and CSS can't animate a layout change —
   * so without this the row teleports to the new slot and only then slides.
   */
  useEffect(() => {
    if (!settle) return;
    if (!settle.running) {
      const frame = requestAnimationFrame(() =>
        setSettle((s) => (s && !s.running ? { ...s, offset: 0, running: true } : s))
      );
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(() => setSettle(null), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settle]);

  const start = useCallback(
    (event: React.PointerEvent<HTMLLIElement>, index: number) => {
      if (disabled) return;
      const rows = listRef.current?.children;
      if (!rows || rows.length < 2) return;

      // Rows are equal height, so one gap between the first two tops is the
      // displacement for every crossing.
      const step =
        rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;

      // Capture so the rest of the gesture reports to this row even once the
      // finger has travelled off it.
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({
        pointerId: event.pointerId,
        from: index,
        over: index,
        startY: event.clientY,
        dy: 0,
        step,
      });
    },
    [disabled]
  );

  const track = useCallback(
    (event: React.PointerEvent<HTMLLIElement>) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dy = event.clientY - drag.startY;
      const over = Math.max(
        0,
        Math.min(order.length - 1, drag.from + Math.round(dy / drag.step))
      );
      if (dy !== drag.dy || over !== drag.over) setDrag({ ...drag, dy, over });
    },
    [drag, order.length]
  );

  const end = useCallback(
    (event: React.PointerEvent<HTMLLIElement>) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const { from, over, dy, step } = drag;
      setDrag(null);

      // Where the finger left the row, relative to the slot it is about to
      // occupy. Handing this to the settle animation is what turns the drop
      // into a slide instead of a jump.
      setSettle({ name: order[from], offset: dy - (over - from) * step, running: false });

      // Committed outside the state updater: updaters must stay pure, and one
      // that saved would fire the write twice under StrictMode.
      if (over !== from) onReorder(move(order, from, over));
    },
    [drag, order, onReorder]
  );

  /** Where row `i` sits, mid-drag or mid-drop. */
  function offsetFor(i: number, name: string): number {
    if (drag) {
      if (i === drag.from) return drag.dy;
      if (drag.from < drag.over && i > drag.from && i <= drag.over) return -drag.step;
      if (drag.from > drag.over && i < drag.from && i >= drag.over) return drag.step;
      return 0;
    }
    return settle?.name === name ? settle.offset : 0;
  }

  /**
   * Only a row that is actually moving gets a transition. Displaced neighbours
   * land on their new slot with the same transform they already had, so leaving
   * a transition on them would animate a move that has already happened.
   */
  function transitionFor(name: string, held: boolean): string {
    if (held) return "none";
    if (settle?.name === name) {
      return settle.running ? `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1)` : "none";
    }
    return drag ? `transform ${SHIFT_MS}ms ease` : "none";
  }

  return (
    <ul ref={listRef} className="flex h-full flex-col gap-1 px-2">
      {order.map((name, i) => {
        const p = profiles.get(name);
        const held = drag?.from === i;
        // The rank badge shows where the row would land, so the numbers stay
        // truthful while the finger is still down.
        const shown = drag ? (held ? drag.over : i + offsetFor(i, name) / drag.step) : i;

        return (
          <li
            key={name}
            onPointerDown={(e) => start(e, i)}
            onPointerMove={track}
            onPointerUp={end}
            onPointerCancel={end}
            style={{
              transform: `translateY(${offsetFor(i, name)}px)`,
              transition: transitionFor(name, held),
              zIndex: held || settle?.name === name ? 10 : undefined,
              touchAction: "none",
            }}
            className={`relative flex min-h-0 flex-1 items-center gap-1.5 rounded-xl px-2
                        ${
                          held
                            ? "bg-[var(--panel-2)] shadow-lg shadow-black/40 ring-1 ring-[var(--accent)]"
                            : "bg-[var(--panel)]"
                        }
                        ${disabled ? "" : "select-none"}`}
          >
            <span className="w-4 shrink-0 text-center text-[13px] font-bold tabular-nums text-[var(--muted)]">
              {Math.round(shown) + 1}
            </span>

            {p?.avatarUrl ? (
              // Sleeper's CDN is not in the remote-image allowlist, and these are 24px.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.avatarUrl}
                alt=""
                draggable={false}
                className="h-6 w-6 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="h-6 w-6 shrink-0 rounded-md bg-[var(--panel-2)]" />
            )}

            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12px] font-semibold">
                {p?.teamName ?? name}
              </span>
              <span className="block truncate text-[9px] text-[var(--muted)]">
                {p?.realName ?? name} &middot; {p?.wins ?? 0}-{p?.losses ?? 0}
              </span>
            </span>

            <span className="w-9 shrink-0 text-right leading-tight">
              <span className="block text-[11px] font-bold tabular-nums">
                {Math.round(p?.pointsFor ?? 0)}
              </span>
              <span className="block text-[7px] uppercase tracking-wide text-[var(--muted)]">
                pf
              </span>
            </span>

            <button
              type="button"
              aria-label={`${p?.realName ?? name} profile`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpenProfile(name)}
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded-lg
                         text-[11px] font-bold text-[var(--muted)] active:bg-[var(--panel-2)]"
            >
              i
            </button>

            {!disabled && (
              <span
                aria-hidden
                className="shrink-0 pr-0.5 text-[13px] leading-none text-[var(--line)]"
              >
                &#8942;&#8942;
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
