import { redirect } from "next/navigation";
import { fetchCalendar } from "@/lib/espn";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await getCurrentUser())) redirect("/login");
  const { currentWeek } = await fetchCalendar();
  redirect(`/week/${currentWeek}`);
}
