import { NextResponse } from "next/server";
import { z } from "zod";
import { PaperlessClient, PaperlessError } from "@/lib/paperless/client";
import { getPaperlessSettings } from "@/lib/db/queries";

export const runtime = "nodejs";

const BodySchema = z.object({
  baseUrl: z.string().url().optional(),
  apiToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const stored = getPaperlessSettings();
    const baseUrl = parsed.data.baseUrl || stored.baseUrl;
    const apiToken = parsed.data.apiToken || stored.apiToken;

    if (!baseUrl || !apiToken) {
      return NextResponse.json(
        { error: "Paperless URL und Token erforderlich." },
        { status: 400 }
      );
    }

    const client = new PaperlessClient(baseUrl, apiToken);
    const result = await client.testConnection();
    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof PaperlessError ? error.status : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
