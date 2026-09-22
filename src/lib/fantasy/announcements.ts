/**
 * The week's scheduled Discord posts: when each one is due, and whether it is
 * due right now.
 *
 * Times are Eastern wall-clock, derived from the week's anchor Tuesday rather
 * than from UTC cron expressions. GitHub's scheduler only speaks UTC and has no
 * notion of daylight saving, so the workflow just pokes this every half hour
 * and the decision of *what is due* is made here, in the right time zone.
 *
 * Every post here is a prompt to vote. The results are not announced: Pat
 * closes the week and posts the board by hand.
 */
import { addDays, etToInstant } from "./time";
import type { RankingWeek, WeekPhase } from "./week";

export type JobId = "open" | "nudge-tue" | "nudge-wed" | "nudge-thu";

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
 * locked in" nudge stops being due the moment Pat closes the week, however late
 * the scheduler is.
 */
const GRACE_MS = 2 * 60 * 60 * 1000;

/** Reminders run Tuesday, Wednesday and Thursday at 2pm ET. */
const NUDGE_HOUR = 14;

export const JOBS: JobDef[] = [
  { id: "open", dayOffset: 0, hour: 10, requires: "open" },
  { id: "nudge-tue", dayOffset: 0, hour: NUDGE_HOUR, requires: "open" },
  { id: "nudge-wed", dayOffset: 1, hour: NUDGE_HOUR, requires: "open" },
  { id: "nudge-thu", dayOffset: 2, hour: NUDGE_HOUR, requires: "open" },
];

/** The instant a job is scheduled for, in the given week. */
export function scheduledAt(job: JobDef, week: RankingWeek): Date {
  return etToInstant(addDays(week.tuesday, job.dayOffset), job.hour);
}

/**
 * Jobs that should fire now: past their time, inside the grace window, and in
 * the phase they were written for. The phase is passed in because closing a
 * week is now a person's decision, held in the database. Whether a job has
 * *already* been sent is a separate question, answered by the claim in the
 * route.
 */
export function dueJobs(week: RankingWeek, phase: WeekPhase, now = new Date()): JobDef[] {
  return JOBS.filter((job) => {
    if (job.requires !== phase) return false;
    const due = scheduledAt(job, week).getTime();
    return now.getTime() >= due && now.getTime() < due + GRACE_MS;
  });
}
