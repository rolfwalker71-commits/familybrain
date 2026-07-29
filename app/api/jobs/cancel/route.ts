import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { jobTypeLabel } from "@/lib/jobs/constants";
import { cancelActiveJobRun, getActiveJobRun } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cancel the currently running background job (if any). */
export async function POST() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const before = getActiveJobRun();
  if (!before) {
    return NextResponse.json({
      ok: true,
      cancelled: false,
      message: "Kein aktiver Job.",
    });
  }
  const cancelled = cancelActiveJobRun("Manuell gestoppt");
  return NextResponse.json({
    ok: true,
    cancelled: true,
    runId: cancelled?.id ?? before.id,
    jobType: before.job_type,
    label: jobTypeLabel(before.job_type),
  });
}
