import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  getDashboardOverview,
  parseOverviewPeriod,
} from "@/lib/dashboard/overview";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { finalizeDuePaymentPlans } = await import(
    "@/lib/finance/payment-pipeline"
  );
  await finalizeDuePaymentPlans().catch(() => undefined);

  const { searchParams } = new URL(request.url);
  const period = parseOverviewPeriod(searchParams.get("period"));
  const anchor = searchParams.get("anchor");
  return NextResponse.json(getDashboardOverview(period, anchor));
}
