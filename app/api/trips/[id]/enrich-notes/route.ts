import { NextResponse } from "next/server";
import { enrichTripDocumentNotes } from "@/lib/trips/enrich-notes";
import { getTripById } from "@/lib/trips/queries";
import { serializeTripEvents } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }
    const result = enrichTripDocumentNotes(tripId);
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      empty: result.empty,
      events: serializeTripEvents(result.events),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
