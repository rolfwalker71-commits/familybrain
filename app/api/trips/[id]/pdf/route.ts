import { NextResponse } from "next/server";
import {
  buildTripExportModel,
  buildTripPdfBuffer,
  tripExportFilename,
} from "@/lib/trips/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
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
    const { bytes } = await buildTripPdfBuffer(model);
    const filename = tripExportFilename(model.trip, "pdf");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
