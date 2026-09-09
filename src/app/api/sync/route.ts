import { NextResponse } from "next/server";
import { fetchCalendar } from "@/lib/espn";
import { syncWeek } from "@/lib/sync";

/** Manual resync escape hatch: /api/sync?week=3 (season defaults to current). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const calendar = await fetchCalendar();
  const season = Number(url.searchParams.get("season")) || calendar.season;
  const week = Number(url.searchParams.get("week")) || calendar.currentWeek;

  const count = await syncWeek(season, week);
  return NextResponse.json({ ok: true, season, week, games: count });
}
