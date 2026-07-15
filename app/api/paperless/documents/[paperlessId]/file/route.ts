import { NextResponse } from "next/server";
import { PaperlessClient, PaperlessError } from "@/lib/paperless/client";
import { getPaperlessSettings } from "@/lib/db/queries";

export const runtime = "nodejs";

type Params = { params: Promise<{ paperlessId: string }> };

function createClient() {
  const { baseUrl, apiToken } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    throw new PaperlessError(
      "Paperless URL und Token müssen konfiguriert sein.",
      400
    );
  }
  return new PaperlessClient(baseUrl, apiToken);
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { paperlessId } = await params;
    const id = Number(paperlessId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "pdf";
    const client = createClient();

    if (type === "thumb") {
      const thumb = await client.getThumbnail(id);
      if (!thumb) {
        return NextResponse.json(
          { error: "Keine Vorschau verfügbar" },
          { status: 404 }
        );
      }
      return new NextResponse(Buffer.from(thumb.buffer), {
        headers: {
          "Content-Type": thumb.contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const original = searchParams.get("original") === "true";
    const file = await client.downloadDocument(id, original);
    return new NextResponse(Buffer.from(file.buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof PaperlessError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
