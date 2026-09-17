"use client";

import { useCallback, useRef, useState } from "react";
import type { Profile } from "@/lib/fantasy/snapshot";

type Props = {
  order: string[];
  profiles: Map<string, Profile>;
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
      setDrag(null);
      // Committed outside the state updater: updaters must stay pure, and one
      // that saved would fire the write twice under StrictMode.
      if (drag.over !== drag.from) onReorder(move(order, drag.from, drag.over));
    },
    [drag, order, onReorder]
  );

  /** Where row `i` sits while a drag is in flight. */
  function offsetFor(i: number): number {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -drag.step;
    if (drag.from > drag.over && i < drag.from && i >= drag.over) return drag.step;
    return 0;
  }

  return (
    <ul ref={listRef} className="flex h-full flex-col gap-1 px-2">
      {order.map((name, i) => {
        const p = profiles.get(name);
        const held = drag?.from === i;
        // The rank badge shows where the row would land, so the numbers stay
        // truthful while the finger is still down.
        const shown = drag ? (held ? drag.over : i + offsetFor(i) / drag.step) : i;

        return (
          <li
            key={name}
            onPointerDown={(e) => start(e, i)}
            onPointerMove={track}
            onPointerUp={end}
            onPointerCancel={end}
            style={{
              transform: `translateY(${offsetFor(i)}px)`,
              transition: held ? "none" : "transform 160ms ease",
              zIndex: held ? 10 : undefined,
              touchAction: "none",
            }}
            className={`relative flex min-h-0 flex-1 items-center gap-2 rounded-xl px-2
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

            <button
              type="button"
              aria-label={`${p?.realName ?? name} profile`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpenProfile(name)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                         text-[11px] font-bold text-[var(--muted)] active:bg-[var(--panel-2)]"
            >
              i
            </button>

            <span aria-hidden className="shrink-0 pr-0.5 text-[13px] leading-none text-[var(--line)]">
              &#8942;&#8942;
            </span>
          </li>
        );
      })}
    </ul>
  );
}
