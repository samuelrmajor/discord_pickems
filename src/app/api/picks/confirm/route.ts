import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { confirmPicks } from "@/lib/queries";

/** A slate is ~16 games; anything near this is not a real card. */
const MAX_PICKS = 32;

/**
 * Re-send a whole card and get back what the database holds.
 *
 * The per-tap endpoint saves optimistically, which means a dropped request can
 * leave the board looking complete while the league sees an empty one. This is
 * the escape hatch from that: it takes every selection on screen, writes them
 * all, and answers with the stored rows so the client can stop guessing.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    season?: number;
    week?: number;
    picks?: Record<string, string>;
  } | null;

  const { season, week } = body ?? {};
  const submitted = body?.picks;
  if (!season || !week || !submitted || typeof submitted !== "object") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const entries = Object.entries(submitted);
  if (entries.length > MAX_PICKS) {
    return NextResponse.json({ error: "too many picks" }, { status: 400 });
  }

  const desired: Record<string, "home" | "away"> = {};
  for (const [gameId, choice] of entries) {
    if (choice !== "home" && choice !== "away") {
      return NextResponse.json({ error: "bad choice" }, { status: 400 });
    }
    desired[gameId] = choice;
  }

  const result = await confirmPicks(user, season, week, desired);
  return NextResponse.json({ ok: true, ...result });
}
