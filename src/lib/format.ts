const TZ = "America/New_York";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Sun, Sep 13" — always in ET, the league's own clock. */
export function dayLabel(date: Date): string {
  return dayFmt.format(date);
}

/** "1:00 PM" in ET. */
export function timeLabel(date: Date): string {
  return `${timeFmt.format(date)} ET`;
}

/** "1:00p" — narrow enough for a fixed column on a phone. */
export function timeShort(date: Date): string {
  const parts = timeFmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const period = get("dayPeriod").toLowerCase().startsWith("p") ? "p" : "a";
  return `${get("hour")}:${get("minute")}${period}`;
}

/** Stable YYYY-MM-DD key in ET, for grouping games into days. */
export function dayKey(date: Date): string {
  return dayKeyFmt.format(date);
}

export function groupByDay<T>(items: T[], getDate: (item: T) => Date): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const date = getDate(item);
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(date), items: [item] });
  }
  return groups;
}
