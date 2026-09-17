import { redirect } from "next/navigation";
import { fetchCalendar } from "@/lib/espn";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Entry point for the Pick'em module: drop in on whatever week is live. */
export default async function PickemsIndex() {
  if (!(await getCurrentUser())) redirect("/login");
  const { currentWeek } = await fetchCalendar();
  redirect(`/pickems/week/${currentWeek}`);
}
