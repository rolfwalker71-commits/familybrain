import { NextResponse } from "next/server";
import {
  buildTripAiImagesZip,
  safeDownloadBasename,
} from "@/lib/trips/ai-images-export";
import { getTripById } from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }

    const { trip, zip, count } = buildTripAiImagesZip(tripId);
    const base = safeDownloadBasename(trip.title, `reise-${trip.id}`);
    const filename = `${base}-ki-bilder.zip`;

    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Image-Count": String(count),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Keine KI-Bilder") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
