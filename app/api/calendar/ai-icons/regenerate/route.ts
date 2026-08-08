import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { regenerateCloudAgendaAiIcons } from "@/lib/dashboard/regenerate-cloud-agenda-ai-icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Image gen can take a while for a batch. */
export const maxDuration = 300;

/**
 * Force-regenerate agenda AI thumbnails for Google + Microsoft calendars
 * (current week). ICS and other local sources are skipped.
 */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  let maxGenerate = 24;
  try {
    const body = (await request.json()) as { maxGenerate?: number };
    if (
      typeof body.maxGenerate === "number" &&
      Number.isFinite(body.maxGenerate)
    ) {
      maxGenerate = Math.min(40, Math.max(1, Math.floor(body.maxGenerate)));
    }
  } catch {
    /* empty body ok */
  }

  const summary = await regenerateCloudAgendaAiIcons({
    maxGenerate,
    userId: auth.userId,
  });

  if (!summary.attempted) {
    return NextResponse.json(
      { error: summary.reason || "nicht gestartet", ...summary },
      { status: 400 }
    );
  }

  return NextResponse.json(summary);
}
