import { NextResponse } from "next/server";
import { enrichEventDocumentNotes } from "@/lib/trips/enrich-notes";
import { getTripEventById } from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    if (
      !Number.isInteger(tripId) ||
      tripId <= 0 ||
      !Number.isInteger(eventId) ||
      eventId <= 0
    ) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }
    const event = enrichEventDocumentNotes(eventId);
    return NextResponse.json({
      ok: true,
      event: serializeTripEvent(event),
      empty: !event.document_notes_md?.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
