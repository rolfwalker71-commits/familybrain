import { NextResponse } from "next/server";
import {
  buildTripExportModel,
  buildTripPdfBuffer,
  tripExportFilename,
} from "@/lib/trips/export";
import { getActiveTripShareLinkByToken } from "@/lib/trips/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { token } = await context.params;
    const share = getActiveTripShareLinkByToken(token);
    if (!share) {
      return NextResponse.json(
        { error: "Share-Link ungültig oder abgelaufen." },
        { status: 404 }
      );
    }
    const model = buildTripExportModel(share.trip_id);
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
