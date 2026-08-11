import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { getMariAttachmentPayload } from "@/lib/mari/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { id: raw } = await context.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige Anhang-ID" }, { status: 400 });
  }

  const wantDownload =
    new URL(request.url).searchParams.get("download") === "1";

  try {
    const payload = await getMariAttachmentPayload(id);
    if (!payload) {
      return NextResponse.json(
        { error: "Anhang nicht gefunden oder leer." },
        { status: 404 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", payload.mimeType || "application/octet-stream");
    // Wichtig: echte Buffer-Länge — Approximierung aus Base64 mit Padding
    // lag oft 1 Byte daneben und Browser zeigten kaputte Platzhalter.
    headers.set("Content-Length", String(payload.bytes.length));
    headers.set("Cache-Control", "private, max-age=300");
    const safeName = payload.orgFilename.replace(/[^\w.\- ()äöüÄÖÜß]+/g, "_");
    headers.set(
      "Content-Disposition",
      `${wantDownload ? "attachment" : "inline"}; filename="${safeName}"`
    );

    return new NextResponse(new Uint8Array(payload.bytes), {
      status: 200,
      headers,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
