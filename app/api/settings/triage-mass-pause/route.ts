import { NextResponse } from "next/server";
import { z } from "zod";
import {
  forceResumeTriageMassPause,
  getTriageMassPausePublic,
  pauseTriageForMassAnalysis,
  resumeTriageAfterMassAnalysis,
} from "@/lib/documents/triage-mass-pause";
import {
  backfillTriageForAnalyzedDocuments,
  getTriageDiagnostics,
} from "@/lib/documents/triage-backfill";
import { getTriageAfterAnalysisSettingsPublic } from "@/lib/documents/triage-settings";
import { getTriageMailSettingsPublic } from "@/lib/mail/triage-mail-settings";
import { notifyTriageReadyEmailsForDocuments } from "@/lib/mail/notify-triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["pause", "resume", "force-resume", "backfill"]),
});

function publicPayload() {
  return {
    ...getTriageMassPausePublic(),
    ...getTriageAfterAnalysisSettingsPublic(),
    ...getTriageMailSettingsPublic(),
    triageDiagnostics: getTriageDiagnostics(),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    ...publicPayload(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "action muss «pause», «resume», «force-resume» oder «backfill» sein.",
      },
      { status: 400 }
    );
  }

  let result: Record<string, unknown>;
  switch (parsed.data.action) {
    case "pause":
      result = pauseTriageForMassAnalysis();
      break;
    case "resume": {
      const resumed = resumeTriageAfterMassAnalysis();
      let mail: { sent: number; skipped: number; errors: number } | undefined;
      const ids = resumed.backfill?.newlyQueuedIds ?? [];
      if (ids.length > 0) {
        mail = await notifyTriageReadyEmailsForDocuments(ids);
      }
      result = { ...resumed, mail };
      break;
    }
    case "force-resume": {
      const forced = forceResumeTriageMassPause();
      let mail: { sent: number; skipped: number; errors: number } | undefined;
      const ids = forced.backfill?.newlyQueuedIds ?? [];
      if (ids.length > 0) {
        mail = await notifyTriageReadyEmailsForDocuments(ids);
      }
      result = { ...forced, mail };
      break;
    }
    case "backfill": {
      const backfill = backfillTriageForAnalyzedDocuments({ limit: 500 });
      let mail: { sent: number; skipped: number; errors: number } | undefined;
      if (backfill.newlyQueuedIds.length > 0) {
        mail = await notifyTriageReadyEmailsForDocuments(
          backfill.newlyQueuedIds
        );
      }
      result = { backfill, mail };
      break;
    }
  }

  return NextResponse.json({
    ok: true,
    action: parsed.data.action,
    ...result,
    ...publicPayload(),
  });
}
