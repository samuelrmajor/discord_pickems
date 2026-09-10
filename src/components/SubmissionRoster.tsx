import type { SubmissionRow } from "@/lib/scoring";

type Props = {
  currentUser: string;
  rows: SubmissionRow[];
  gameCount: number;
};

/**
 * Who's filled out the week. Counts only — no sides — so it's safe to show
 * while games are still open, which is the whole point: it's the nag list.
 */
export default function SubmissionRoster({ currentUser, rows, gameCount }: Props) {
  if (gameCount === 0) return null;

  const complete = rows.filter((r) => r.picked === r.total).length;
  const outstanding = rows.filter((r) => r.remaining > 0);

  return (
    <section className="px-2 pt-2">
      <div className="flex items-baseline justify-between px-1 pb-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Cards in
        </h2>
        <span
          className={`text-[10px] font-semibold tabular-nums ${
            outstanding.length === 0 ? "text-[var(--accent)]" : "text-[var(--warn)]"
          }`}
        >
          {complete}/{rows.length} complete
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-x-1 overflow-hidden rounded-lg bg-[var(--panel)] p-1">
        {rows.map((row) => (
          <RosterRow key={row.name} row={row} isMe={row.name === currentUser} />
        ))}
      </ul>

      {outstanding.length > 0 && (
        <p className="px-1 pt-1 text-[10px] leading-tight text-[var(--muted)]">
          Still out:{" "}
          <span className="capitalize text-[var(--warn)]">
            {outstanding.map((r) => r.name.replace("_", " ")).join(", ")}
          </span>
        </p>
      )}
    </section>
  );
}

function RosterRow({ row, isMe }: { row: SubmissionRow; isMe: boolean }) {
  const full = row.picked === row.total;

  // Three states worth telling apart: all in, still owes picks, and out of
  // time on games they never picked.
  const { mark, cls, title } = full
    ? {
        mark: "✓",
        cls: "text-[var(--accent)]",
        title: `${row.name} has all ${row.total} in`,
      }
    : row.remaining > 0
      ? {
          mark: `${row.remaining} left`,
          cls: "text-[var(--warn)]",
          title: `${row.name} still has ${row.remaining} of ${row.total} to pick`,
        }
      : {
          mark: `${row.missed} missed`,
          cls: "text-[var(--loss)]",
          title: `${row.name} never picked ${row.missed} game${
            row.missed === 1 ? "" : "s"
          } that have kicked off`,
        };

  return (
    <li
      title={title}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
        isMe ? "bg-[var(--panel-2)]" : ""
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold capitalize leading-tight">
        {row.name.replace("_", " ")}
      </span>
      <span className="shrink-0 text-[9px] tabular-nums text-[var(--muted)]">
        {row.picked}/{row.total}
      </span>
      <span className={`w-11 shrink-0 text-right text-[10px] font-semibold leading-tight ${cls}`}>
        {mark}
      </span>
    </li>
  );
}
