import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { cancelActiveJobRun, getActiveJobRun } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cancel the currently running Sync/Analyse job (if any). */
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
  });
}
