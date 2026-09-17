"use client";

import type { ConsensusRow } from "@/lib/fantasy/rankings";
import type { ProfileCard } from "@/lib/fantasy/profiles";
import SubmissionList, { type Submission } from "./SubmissionList";

type Props = {
  consensus: ConsensusRow[] | null;
  profiles: Map<string, ProfileCard>;
  submissions: Submission[];
  ballotCount: number;
  locksLabel: string;
  onOpenProfile: (name: string) => void;
};

export default function ResultsBoard({
  consensus,
  profiles,
  submissions,
  ballotCount,
  locksLabel,
  onOpenProfile,
}: Props) {
  // Before the lock this tab is the roll call: who has voted, never what they
  // picked. The consensus simply isn't sent from the server until then.
  if (!consensus) {
    return (
      <SubmissionList
        submissions={submissions}
        profiles={profiles}
        locksLabel={locksLabel}
        locked={false}
      />
    );
  }

  if (ballotCount === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="text-[13px] text-[var(--muted)]">Nobody voted this week.</p>
      </div>
    );
  }

  return (
    <ul className="flex h-full flex-col gap-1 px-2">
      {consensus.map((row) => {
        const p = profiles.get(row.name);
        return (
          <li
            key={row.name}
            className="flex min-h-0 flex-1 items-center gap-2 rounded-xl bg-[var(--panel)] px-2"
          >
            <span className="w-4 shrink-0 text-center text-[13px] font-bold tabular-nums">
              {row.rank}
            </span>

            <span className="w-4 shrink-0 text-center text-[10px] font-bold leading-none">
              {row.delta === null || row.delta === 0 ? (
                <span className="text-[var(--line)]">&ndash;</span>
              ) : row.delta > 0 ? (
                <span className="text-[var(--accent)]">&#9650;{row.delta}</span>
              ) : (
                <span className="text-[var(--loss)]">&#9660;{-row.delta}</span>
              )}
            </span>

            {p?.avatarUrl ? (
              // Sleeper's CDN is not in the remote-image allowlist, and these are 24px.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="h-6 w-6 shrink-0 rounded-md bg-[var(--panel-2)]" />
            )}

            <button
              type="button"
              onClick={() => onOpenProfile(row.name)}
              className="min-w-0 flex-1 text-left leading-tight"
            >
              <span className="block truncate text-[12px] font-semibold">
                {p?.teamName ?? row.name}
              </span>
              <span className="block truncate text-[9px] text-[var(--muted)]">
                {p?.realName ?? row.name} &middot; high {row.best} &middot; low {row.worst}
              </span>
            </button>

            <span className="shrink-0 text-right">
              <span className="block text-[13px] font-bold tabular-nums">
                {row.average.toFixed(2)}
              </span>
              <span className="block text-[8px] uppercase text-[var(--muted)]">avg</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
