/**
 * The week's scheduled Discord posts: when each one is due, and whether it is
 * due right now.
 *
 * Times are Eastern wall-clock, derived from the week's anchor Tuesday rather
 * than from UTC cron expressions. GitHub's scheduler only speaks UTC and has no
 * notion of daylight saving, so the workflow just pokes this every half hour
 * and the decision of *what is due* is made here, in the right time zone.
 */
import { addDays, etToInstant } from "./time";
import { phaseOf, type RankingWeek } from "./week";

export type JobId = "open" | "nudge-tue" | "nudge-wed" | "nudge-thu" | "results";

export type JobDef = {
  id: JobId;
  /** Days after the week's Tuesday. */
  dayOffset: number;
  /** Eastern hour, 24h. */
  hour: number;
  /** The post only makes sense while the week is in this phase. */
  requires: "open" | "locked";
};

/**
 * A missed run must not mean a missed post, so a job stays due for a while
 * after its time. The phase guard is what actually bounds it: a "you haven't
 * locked in" nudge stops being due the moment voting closes, however late the
 * scheduler is.
 */
const GRACE_MS = 2 * 60 * 60 * 1000;

export const JOBS: JobDef[] = [
  { id: "open", dayOffset: 0, hour: 10, requires: "open" },
  { id: "nudge-tue", dayOffset: 0, hour: 19, requires: "open" },
  { id: "nudge-wed", dayOffset: 1, hour: 19, requires: "open" },
  { id: "nudge-thu", dayOffset: 2, hour: 17, requires: "open" },
  { id: "results", dayOffset: 4, hour: 15, requires: "locked" },
];

/** The instant a job is scheduled for, in the given week. */
export function scheduledAt(job: JobDef, week: RankingWeek): Date {
  return etToInstant(addDays(week.tuesday, job.dayOffset), job.hour);
}

/**
 * Jobs that should fire now: past their time, inside the grace window, and in
 * the phase they were written for. Whether one has *already* been sent is a
 * separate question, answered by the claim in the route.
 */
export function dueJobs(week: RankingWeek, now = new Date()): JobDef[] {
  const phase = phaseOf(week, now);
  return JOBS.filter((job) => {
    if (job.requires !== phase) return false;
    const due = scheduledAt(job, week).getTime();
    return now.getTime() >= due && now.getTime() < due + GRACE_MS;
  });
}
