import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getOpenAISettings,
  getPaperlessSettings,
  saveOpenAISettings,
  savePaperlessSettings,
} from "@/lib/db/queries";
import { maskToken } from "@/lib/utils/format";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";

export async function GET() {
  const paperless = getPaperlessSettings();
  const openai = getOpenAISettings();
  return NextResponse.json({
    paperlessBaseUrl: paperless.baseUrl,
    paperlessApiTokenMasked: maskToken(paperless.apiToken),
    hasPaperlessToken: Boolean(paperless.apiToken),
    openaiApiKeyMasked: maskToken(openai.apiKey),
    hasOpenAIKey: hasOpenAIKey(),
    openaiModel: openai.model,
  });
}

const PutSchema = z.object({
  paperlessBaseUrl: z.string().url().optional(),
  paperlessApiToken: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().min(1).optional(),
});

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingabe", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.paperlessBaseUrl) {
    savePaperlessSettings(
      parsed.data.paperlessBaseUrl,
      parsed.data.paperlessApiToken ?? null
    );
  } else if (parsed.data.paperlessApiToken) {
    const current = getPaperlessSettings();
    if (!current.baseUrl) {
      return NextResponse.json(
        { error: "Paperless Basis-URL fehlt." },
        { status: 400 }
      );
    }
    savePaperlessSettings(current.baseUrl, parsed.data.paperlessApiToken);
  }

  if (parsed.data.openaiApiKey !== undefined || parsed.data.openaiModel) {
    saveOpenAISettings(
      parsed.data.openaiApiKey ?? null,
      parsed.data.openaiModel ?? null
    );
  }

  const paperless = getPaperlessSettings();
  const openai = getOpenAISettings();

  return NextResponse.json({
    ok: true,
    paperlessBaseUrl: paperless.baseUrl,
    paperlessApiTokenMasked: maskToken(paperless.apiToken),
    hasPaperlessToken: Boolean(paperless.apiToken),
    openaiApiKeyMasked: maskToken(openai.apiKey),
    hasOpenAIKey: hasOpenAIKey(),
    openaiModel: openai.model,
  });
}
