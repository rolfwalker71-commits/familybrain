import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { countDocumentsFromO365 } from "@/lib/buddy/source-links";
import {
  configureO365PdfBackfill,
  getO365PdfBackfillStatus,
  O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
  O365_PDF_BACKFILL_MAX_PDFS_PER_RUN,
} from "@/lib/microsoft/mail-paperless-backfill";
import {
  configureO365PdfLive,
  getO365PdfLiveStatus,
  O365_PDF_LIVE_MAX_INTERVAL_MINUTES,
  O365_PDF_LIVE_MIN_INTERVAL_MINUTES,
} from "@/lib/microsoft/mail-paperless-live";
import { getActiveJobRun, getSchedulerSettings } from "@/lib/jobs/queries";
import {
  JOB_TYPE_O365_PDF_BACKFILL,
  JOB_TYPE_O365_PDF_LIVE,
  jobTypeLabel,
} from "@/lib/jobs/constants";
import { getSchedulerRuntimeStatus } from "@/lib/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  /** Soft-stop: disable + cancel auto-chain; keeps Graph cursor. */
  stop: z.boolean().optional(),
  sinceYmd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resetStats: z.boolean().optional(),
  /** Ongoing import for new mail (default off). */
  liveEnabled: z.boolean().optional(),
  liveIntervalMinutes: z
    .number()
    .int()
    .min(O365_PDF_LIVE_MIN_INTERVAL_MINUTES)
    .max(O365_PDF_LIVE_MAX_INTERVAL_MINUTES)
    .optional(),
  liveResetWatermark: z.boolean().optional(),
});

function enrichStatus() {
  const status = getO365PdfBackfillStatus();
  const live = getO365PdfLiveStatus();
  const active = getActiveJobRun();
  const o365JobRunning =
    (active?.job_type === JOB_TYPE_O365_PDF_BACKFILL ||
      active?.job_type === JOB_TYPE_O365_PDF_LIVE) &&
    active.status === "running";
  const otherJobRunning = Boolean(active) && !o365JobRunning;
  const scheduler = getSchedulerRuntimeStatus();
  const settings = getSchedulerSettings();
  return {
    ...status,
    documentsFromO365: countDocumentsFromO365(),
    liveSync: live,
    limits: {
      messagesPerRun: O365_PDF_BACKFILL_MAX_MESSAGES_PER_RUN,
      pdfsPerRun: O365_PDF_BACKFILL_MAX_PDFS_PER_RUN,
    },
    job: {
      o365Running: o365JobRunning,
      otherRunning: otherJobRunning,
      activeLabel: active ? jobTypeLabel(active.job_type) : null,
    },
    scheduler: {
      enabled: settings.enabled,
      intervalMinutes: settings.intervalMinutes,
      nextTickAt: scheduler.nextTickAt,
    },
  };
}

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(enrichStatus());
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const {
    liveEnabled,
    liveIntervalMinutes,
    liveResetWatermark,
    ...backfill
  } = parsed.data;
  if (
    backfill.enabled !== undefined ||
    backfill.stop !== undefined ||
    backfill.sinceYmd !== undefined ||
    backfill.resetStats !== undefined
  ) {
    configureO365PdfBackfill(backfill);
  }
  if (
    liveEnabled !== undefined ||
    liveIntervalMinutes !== undefined ||
    liveResetWatermark
  ) {
    configureO365PdfLive({
      enabled: liveEnabled,
      intervalMinutes: liveIntervalMinutes,
      resetWatermark: liveResetWatermark,
    });
  }
  return NextResponse.json(enrichStatus());
}
