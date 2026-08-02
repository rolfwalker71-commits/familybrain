import { NextResponse } from "next/server";
import { z } from "zod";
import {
  forceResumeTriageMassPause,
  getTriageMassPausePublic,
  pauseTriageForMassAnalysis,
  resumeTriageAfterMassAnalysis,
} from "@/lib/documents/triage-mass-pause";
import { backfillTriageForAnalyzedDocuments } from "@/lib/documents/triage-backfill";
import { getTriageAfterAnalysisSettingsPublic } from "@/lib/documents/triage-settings";
import { getTriageMailSettingsPublic } from "@/lib/mail/triage-mail-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["pause", "resume", "force-resume", "backfill"]),
});

export async function GET() {
  return NextResponse.json({
    ok: true,
    ...getTriageMassPausePublic(),
    ...getTriageAfterAnalysisSettingsPublic(),
    ...getTriageMailSettingsPublic(),
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
    case "resume":
      result = resumeTriageAfterMassAnalysis();
      break;
    case "force-resume":
      result = forceResumeTriageMassPause();
      break;
    case "backfill":
      result = {
        backfill: backfillTriageForAnalyzedDocuments({ limit: 500 }),
      };
      break;
  }

  return NextResponse.json({
    ok: true,
    action: parsed.data.action,
    ...result,
    ...getTriageMassPausePublic(),
    ...getTriageAfterAnalysisSettingsPublic(),
    ...getTriageMailSettingsPublic(),
  });
}
