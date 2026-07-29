import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  JOB_TYPE_AI_ICONS_MISSING,
  JOB_TYPE_ANALYZE_PENDING,
  JOB_TYPE_PAPERLESS_WRITEBACK,
  JOB_TYPE_SYNC_ANALYZE,
  jobTypeLabel,
} from "@/lib/jobs/constants";
import {
  runAiIconsMissingJob,
  runAnalyzePendingJob,
  runPaperlessWritebackJob,
} from "@/lib/jobs/background-runners";
import { getActiveJobRun } from "@/lib/jobs/queries";
import { runSyncAnalyzeJob } from "@/lib/jobs/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

  const BodySchema = z.object({
    jobType: z
      .enum([
        JOB_TYPE_SYNC_ANALYZE,
        JOB_TYPE_ANALYZE_PENDING,
        JOB_TYPE_AI_ICONS_MISSING,
        JOB_TYPE_PAPERLESS_WRITEBACK,
      ])
      .optional()
      .default(JOB_TYPE_SYNC_ANALYZE),
  });

/**
 * Fire-and-forget durable background job. Continues after the HTTP response.
 * Body: { jobType?: "sync_analyze" | "analyze_pending" | "ai_icons_missing" | "paperless_writeback" }
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const jobType = parsed.data.jobType;
  const active = getActiveJobRun();
  if (active) {
    return NextResponse.json(
      {
        error: `Hintergrund-Job läuft bereits (${jobTypeLabel(active.job_type)}). Bitte stoppen oder warten.`,
        activeRun: active,
      },
      { status: 409 }
    );
  }

  if (jobType === JOB_TYPE_SYNC_ANALYZE) {
    void runSyncAnalyzeJob("manual");
  } else if (jobType === JOB_TYPE_ANALYZE_PENDING) {
    void runAnalyzePendingJob("manual");
  } else if (jobType === JOB_TYPE_AI_ICONS_MISSING) {
    void runAiIconsMissingJob("manual");
  } else if (jobType === JOB_TYPE_PAPERLESS_WRITEBACK) {
    void runPaperlessWritebackJob("manual");
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      jobType,
      label: jobTypeLabel(jobType),
    },
    { status: 202 }
  );
}
