import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteTripEvent,
  getTripEventById,
  updateTripEvent,
} from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  eventType: z.string().min(1).optional(),
  title: z.string().min(1).max(300).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortKey: z.number().optional(),
  flightNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  departureAirport: z.string().nullable().optional(),
  arrivalAirport: z.string().nullable().optional(),
  departureTerminal: z.string().nullable().optional(),
  arrivalTerminal: z.string().nullable().optional(),
  departureGate: z.string().nullable().optional(),
  arrivalGate: z.string().nullable().optional(),
  checkInDesk: z.string().nullable().optional(),
  baggageBelt: z.string().nullable().optional(),
  originPlace: z.string().nullable().optional(),
  destinationPlace: z.string().nullable().optional(),
  departureLat: z.number().nullable().optional(),
  departureLon: z.number().nullable().optional(),
  arrivalLat: z.number().nullable().optional(),
  arrivalLon: z.number().nullable().optional(),
  documentNotesMd: z.string().nullable().optional(),
  showDocumentNotes: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function PATCH(request: Request, context: Ctx) {
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
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const event = updateTripEvent(eventId, parsed.data);
    return NextResponse.json({ ok: true, event: serializeTripEvent(event) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }
    deleteTripEvent(eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
