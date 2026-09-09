import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { saveBulkPicks, type BulkMode } from "@/lib/queries";

const MODES: BulkMode[] = ["home", "away", "favorite"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    season?: number;
    week?: number;
    mode?: BulkMode;
    overwrite?: boolean;
  } | null;

  const { season, week, mode } = body ?? {};
  if (!season || !week || !mode || !MODES.includes(mode)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const result = await saveBulkPicks(user, season, week, mode, body?.overwrite === true);
  return NextResponse.json({ ok: true, ...result });
}
