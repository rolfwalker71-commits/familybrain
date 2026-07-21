import { NextResponse } from "next/server";
import {
  buildTripExportModel,
  renderTripExportHtml,
  tripExportFilename,
} from "@/lib/trips/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    url.host;
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const proto = forwardedProto || url.protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

export async function GET(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const model = buildTripExportModel(id);
    if (!model) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }
    const html = renderTripExportHtml(model, {
      absoluteOrigin: requestOrigin(request),
    });
    const filename = tripExportFilename(model.trip, "html");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
