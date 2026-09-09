import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { savePick } from "@/lib/queries";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { gameId?: string; choice?: string }
    | null;

  const gameId = body?.gameId;
  const choice = body?.choice;
  if (!gameId || (choice !== "home" && choice !== "away")) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const saved = await savePick(user, gameId, choice);
  if (!saved) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
