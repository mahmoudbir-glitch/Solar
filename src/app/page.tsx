import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import SolarDashboardClient from "@/components/solar-dashboard-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SolarDashboard() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    redirect("/login?next=/");
  }

  return <SolarDashboardClient />;
}
