import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { countDocumentsFromO365 } from "@/lib/buddy/source-links";
import {
  configureO365PdfBackfill,
  getO365PdfBackfillStatus,
} from "@/lib/microsoft/mail-paperless-backfill";
import { getActiveJobRun, getSchedulerSettings } from "@/lib/jobs/queries";
import { JOB_TYPE_O365_PDF_BACKFILL, jobTypeLabel } from "@/lib/jobs/constants";
import { getSchedulerRuntimeStatus } from "@/lib/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  sinceYmd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resetStats: z.boolean().optional(),
});

function enrichStatus() {
  const status = getO365PdfBackfillStatus();
  const active = getActiveJobRun();
  const o365JobRunning =
    active?.job_type === JOB_TYPE_O365_PDF_BACKFILL &&
    active.status === "running";
  const otherJobRunning = Boolean(active) && !o365JobRunning;
  const scheduler = getSchedulerRuntimeStatus();
  const settings = getSchedulerSettings();
  return {
    ...status,
    documentsFromO365: countDocumentsFromO365(),
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
  configureO365PdfBackfill(parsed.data);
  return NextResponse.json(enrichStatus());
}
