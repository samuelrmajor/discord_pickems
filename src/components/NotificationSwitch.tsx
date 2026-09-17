"use client";

import { useState, useTransition } from "react";
import { toggleNotifications } from "@/app/notification-actions";

type Props = { moduleKey: string; moduleName: string; enabled: boolean };

/**
 * Per-module Discord notification toggle, shown beside each tile on the hub.
 *
 * Flips optimistically and reverts if the write fails — this is a preference,
 * not a transaction, and a switch that waits on a round trip before moving
 * feels broken on a phone.
 */
export default function NotificationSwitch({ moduleKey, moduleName, enabled }: Props) {
  const [on, setOn] = useState(enabled);
  const [, startTransition] = useTransition();

  const flip = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await toggleNotifications(moduleKey, next);
      if (!result.ok) setOn(!next);
    });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${moduleName} notifications`}
      onClick={flip}
      className="flex shrink-0 flex-col items-center gap-1 rounded-xl px-1.5 py-1 active:bg-[var(--panel-2)]"
    >
      <span
        aria-hidden
        className={`relative block h-5 w-9 rounded-full transition-colors ${
          on ? "bg-[var(--accent)]" : "bg-[var(--panel-2)]"
        }`}
      >
        <span
          className={`absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="text-[8px] uppercase tracking-wide text-[var(--muted)]">
        {on ? "pings on" : "muted"}
      </span>
    </button>
  );
}
