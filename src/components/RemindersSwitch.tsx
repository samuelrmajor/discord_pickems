"use client";

import { useState, useTransition } from "react";
import { toggleReminders } from "@/app/notification-actions";

type Props = { enabled: boolean };

/**
 * The league's one reminder switch, on the hub.
 *
 * It governs whether the Tuesday-to-Thursday Discord posts mention you or just
 * name you — the posts themselves list everyone either way, so turning this off
 * makes them quiet, not blind to you.
 *
 * Flips optimistically and reverts if the write fails — this is a preference,
 * not a transaction, and a switch that waits on a round trip before moving
 * feels broken on a phone.
 */
export default function RemindersSwitch({ enabled }: Props) {
  const [on, setOn] = useState(enabled);
  const [, startTransition] = useTransition();

  const flip = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await toggleReminders(next);
      if (!result.ok) setOn(!next);
    });
  };

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">Discord reminders</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
          {on
            ? "You'll be @'d in the reminder posts until everything's in."
            : "The reminders will name you without pinging you."}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Discord reminders"
        onClick={flip}
        className="shrink-0 rounded-xl p-1 active:bg-[var(--panel-2)]"
      >
        <span
          aria-hidden
          className={`relative block h-6 w-11 rounded-full transition-colors ${
            on ? "bg-[var(--accent)]" : "bg-[var(--panel-2)]"
          }`}
        >
          <span
            className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white transition-transform ${
              on ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
