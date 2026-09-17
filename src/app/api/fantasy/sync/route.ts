import { NextResponse } from "next/server";
import { refreshSnapshot } from "@/lib/fantasy/snapshot";
import { getCurrentUser } from "@/lib/session";

/**
 * Pull the league down from Sleeper and store the processed snapshot.
 *
 * The page fires this on mount rather than doing the work inline: a cold cache
 * means an 11MB player download, which is a loading screen's job, not a
 * server-render's. Already-fresh resources are no-ops, so calling it on every
 * visit is cheap.
 */
export async function POST() {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  try {
    const snapshot = await refreshSnapshot();
    return NextResponse.json({ ok: true, builtAt: snapshot.builtAt });
  } catch (err) {
    console.error("fantasy sync failed", err);
    return NextResponse.json({ error: "sync failed" }, { status: 502 });
  }
}
