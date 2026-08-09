import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  JOB_TYPE_AI_ICONS_MISSING,
  JOB_TYPE_AI_ICONS_REGENERATE,
  JOB_TYPE_ANALYZE_PENDING,
  JOB_TYPE_DRIVE_MIRROR,
  JOB_TYPE_O365_PDF_BACKFILL,
  JOB_TYPE_O365_PDF_LIVE,
  JOB_TYPE_PAPERLESS_WRITEBACK,
  JOB_TYPE_SYNC_ANALYZE,
  jobTypeLabel,
} from "@/lib/jobs/constants";
import {
  runAiIconsMissingJob,
  runAiIconsRegenerateJob,
  runAnalyzePendingJob,
  runDriveMirrorJob,
  runO365PdfBackfillJob,
  runO365PdfLiveJob,
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
      JOB_TYPE_AI_ICONS_REGENERATE,
      JOB_TYPE_PAPERLESS_WRITEBACK,
      JOB_TYPE_DRIVE_MIRROR,
      JOB_TYPE_O365_PDF_BACKFILL,
      JOB_TYPE_O365_PDF_LIVE,
    ])
    .optional()
    .default(JOB_TYPE_SYNC_ANALYZE),
  /** With analyze_pending: re-queue all analysis_status=error first. */
  resetErrors: z.boolean().optional().default(false),
  /** With analyze_pending: re-queue all completed/error/stale for full re-run. */
  requeueAll: z.boolean().optional().default(false),
});

/**
 * Fire-and-forget durable background job. Continues after the HTTP response.
 * Body: { jobType?, resetErrors?, requeueAll? }
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
  const resetErrors = parsed.data.resetErrors;
  const requeueAll = parsed.data.requeueAll;
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
    void runAnalyzePendingJob("manual", { resetErrors, requeueAll });
  } else if (jobType === JOB_TYPE_AI_ICONS_MISSING) {
    void runAiIconsMissingJob("manual");
  } else if (jobType === JOB_TYPE_AI_ICONS_REGENERATE) {
    void runAiIconsRegenerateJob("manual");
  } else if (jobType === JOB_TYPE_PAPERLESS_WRITEBACK) {
    void runPaperlessWritebackJob("manual");
  } else if (jobType === JOB_TYPE_DRIVE_MIRROR) {
    void runDriveMirrorJob("manual");
  } else if (jobType === JOB_TYPE_O365_PDF_BACKFILL) {
    void runO365PdfBackfillJob("manual");
  } else if (jobType === JOB_TYPE_O365_PDF_LIVE) {
    void runO365PdfLiveJob("manual");
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      jobType,
      resetErrors: jobType === JOB_TYPE_ANALYZE_PENDING ? resetErrors : false,
      requeueAll: jobType === JOB_TYPE_ANALYZE_PENDING ? requeueAll : false,
      label: jobTypeLabel(jobType),
    },
    { status: 202 }
  );
}
