import { getAuthContext } from "@/lib/auth/current-user";
import { getAppUserById, getAppUserByUsername } from "@/lib/users/queries";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const auth = await getAuthContext();
  const user = auth?.userId
    ? getAppUserById(auth.userId)
    : auth?.kind === "admin"
      ? getAppUserByUsername(auth.username)
      : null;
  const welcomeName = user?.display_name || auth?.username || null;

  return <OverviewDashboard greetingName={welcomeName} />;
}
