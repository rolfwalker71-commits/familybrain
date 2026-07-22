import { NextResponse } from "next/server";
import { z } from "zod";
import { TRIP_EVENT_TYPES } from "@/lib/trips/constants";
import {
  createTripEvent,
  getTripById,
  listTripEvents,
} from "@/lib/trips/queries";
import {
  serializeTripEvent,
  serializeTripEvents,
} from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  eventType: z.string().min(1),
  title: z.string().min(1).max(300),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documentId: z.number().nullable().optional(),
  travelItemId: z.number().nullable().optional(),
  guideId: z.number().nullable().optional(),
  noteId: z.string().nullable().optional(),
  sourceExcerpt: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  cabinClass: z.string().nullable().optional(),
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
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!getTripById(id)) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({
    events: serializeTripEvents(listTripEvents(id)),
  });
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    if (
      !(TRIP_EVENT_TYPES as readonly string[]).includes(parsed.data.eventType) &&
      parsed.data.eventType !== "Sonstiges"
    ) {
      // still allow via normalize in createTripEvent
    }
    const event = createTripEvent(id, parsed.data);
    return NextResponse.json({ ok: true, event: serializeTripEvent(event) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
