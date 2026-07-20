import { NextResponse } from "next/server";
import { z } from "zod";
import { getTriliumSettings } from "@/lib/db/queries";
import { TriliumClient, TriliumError } from "@/lib/trilium/client";

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

    const stored = getTriliumSettings();
    const baseUrl = parsed.data.baseUrl || stored.baseUrl;
    const apiToken = parsed.data.apiToken || stored.apiToken;

    if (!baseUrl || !apiToken) {
      return NextResponse.json(
        { error: "Trilium URL und ETAPI-Token erforderlich." },
        { status: 400 }
      );
    }

    const client = new TriliumClient(baseUrl, apiToken);
    const info = await client.testConnection();
    return NextResponse.json({
      ok: true,
      appVersion: info.appVersion || null,
      utcDateTime: info.utcDateTime || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof TriliumError ? error.status : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
