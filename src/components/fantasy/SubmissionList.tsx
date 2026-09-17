"use client";

import type { ProfileCard } from "@/lib/fantasy/profiles";

export type Submission = { name: string; started: boolean; lockedIn: boolean };

type Props = {
  submissions: Submission[];
  profiles: Map<string, ProfileCard>;
  locksLabel: string;
  locked: boolean;
};

type Group = { key: string; label: string; tint: string; rows: Submission[] };

/**
 * Who has voted this week, by name.
 *
 * This is the one thing about other people's ballots that is public before the
 * lock — the ordering itself stays sealed. Grouping by state answers the
 * question people actually ask ("who are we waiting on?") without making them
 * read twelve rows to work it out.
 */
export default function SubmissionList({
  submissions,
  profiles,
  locksLabel,
  locked,
}: Props) {
  const groups: Group[] = [
    {
      key: "in",
      label: "Locked in",
      tint: "bg-[var(--accent)]",
      rows: submissions.filter((s) => s.lockedIn),
    },
    {
      key: "draft",
      label: "Started, not locked in",
      tint: "bg-[var(--warn)]",
      rows: submissions.filter((s) => s.started && !s.lockedIn),
    },
    {
      key: "none",
      label: locked ? "Never voted" : "Waiting on",
      tint: "bg-[var(--line)]",
      rows: submissions.filter((s) => !s.started),
    },
  ].filter((g) => g.rows.length > 0);

  const lockedIn = submissions.filter((s) => s.lockedIn).length;

  return (
    <div className="flex h-full flex-col px-3">
      <div className="shrink-0 pb-2 text-center">
        <p className="text-[13px] font-semibold">
          {locked ? "Final ballots" : "Ballots are sealed"}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
          {locked ? (
            <>Voting closed {locksLabel}.</>
          ) : (
            <>
              Everyone&apos;s picks open at{" "}
              <span className="font-semibold text-[var(--warn)]">{locksLabel}</span>. You can see
              who has voted, not what they picked.
            </>
          )}
        </p>
        <p className="mt-1 text-[12px] font-bold tabular-nums text-[var(--accent)]">
          {lockedIn} of {submissions.length} locked in
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-2">
        {groups.map((group) => (
          <section key={group.key}>
            <h3 className="flex items-center gap-1.5 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${group.tint}`} />
              {group.label}
              <span className="tabular-nums opacity-70">{group.rows.length}</span>
            </h3>
            <ul className="flex flex-wrap gap-1">
              {group.rows.map((row) => {
                const p = profiles.get(row.name);
                return (
                  <li
                    key={row.name}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--panel)] py-1 pl-1 pr-2"
                  >
                    {p?.avatarUrl ? (
                      // Sleeper's CDN is not in the remote-image allowlist.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-5 w-5 shrink-0 rounded bg-[var(--panel-2)]" />
                    )}
                    <span className="text-[11px] font-semibold">{p?.realName ?? row.name}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
