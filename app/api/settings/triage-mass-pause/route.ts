import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getTriageMassPausePublic,
  pauseTriageForMassAnalysis,
  resumeTriageAfterMassAnalysis,
} from "@/lib/documents/triage-mass-pause";
import { getTriageAfterAnalysisSettingsPublic } from "@/lib/documents/triage-settings";
import { getTriageMailSettingsPublic } from "@/lib/mail/triage-mail-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["pause", "resume"]),
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
      { error: "action muss «pause» oder «resume» sein." },
      { status: 400 }
    );
  }

  const result =
    parsed.data.action === "pause"
      ? pauseTriageForMassAnalysis()
      : resumeTriageAfterMassAnalysis();

  return NextResponse.json({
    ok: true,
    action: parsed.data.action,
    ...result,
    ...getTriageMassPausePublic(),
    ...getTriageAfterAnalysisSettingsPublic(),
    ...getTriageMailSettingsPublic(),
  });
}
