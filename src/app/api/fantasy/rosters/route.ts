import { NextResponse } from "next/server";
import { readRosters } from "@/lib/fantasy/snapshot";
import { canSeeModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/session";

/**
 * Every manager's roster, fetched on demand the first time a profile sheet is
 * opened rather than shipped with the page.
 *
 * Responses are addressed by content version (`?v=`), so they can be cached
 * hard: a given version's rosters never change, and the page tells the client
 * which version is current. A request for a superseded version is answered with
 * the current one plus its version, and the client re-keys its cache.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  if (!canSeeModule(user, "fantasy")) {
    return NextResponse.json({ error: "not available" }, { status: 403 });
  }

  const data = await readRosters();
  if (!data) {
    return NextResponse.json({ error: "league data not loaded yet" }, { status: 503 });
  }

  const asked = new URL(request.url).searchParams.get("v");
  const matched = asked === data.version;

  return NextResponse.json(data, {
    headers: {
      // Only a versioned hit is immutable; an unversioned or stale request has
      // to stay revalidatable, since "current" moves.
      "Cache-Control": matched
        ? "private, max-age=604800, immutable"
        : "private, no-cache",
    },
  });
}
