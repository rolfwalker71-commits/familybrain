import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { getDashboardStats } from "@/lib/db/queries";
import { resolveGoogleUserId } from "@/lib/google/oauth";
import { countPendingMailTriage } from "@/lib/mail/mail-analysis-store";
import { resolveMicrosoftUserId } from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getDashboardStats();
  let mailTriageGoogle = 0;
  let mailTriageMicrosoft = 0;
  try {
    const auth = await requireAuth();
    if (!isAuthError(auth)) {
      const googleUserId = resolveGoogleUserId(auth);
      const microsoftUserId = resolveMicrosoftUserId(auth);
      if (googleUserId != null) {
        mailTriageGoogle = countPendingMailTriage(googleUserId, "google");
      }
      if (microsoftUserId != null) {
        mailTriageMicrosoft = countPendingMailTriage(
          microsoftUserId,
          "microsoft"
        );
      }
    }
  } catch {
    /* Stats ohne Auth bleiben nutzbar; Mail-Counts optional */
  }
  return NextResponse.json({
    ...stats,
    mailTriageGoogle,
    mailTriageMicrosoft,
  });
}
