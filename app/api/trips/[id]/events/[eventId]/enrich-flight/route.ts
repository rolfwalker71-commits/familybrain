import { NextResponse } from "next/server";
import { enrichFlightEvent } from "@/lib/trips/enrich-flight";
import {
  aircraftPublicUrl,
  mapPublicUrl,
} from "@/lib/trips/cover";
import { getTripEventById } from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }
    const event = await enrichFlightEvent(eventId);
    return NextResponse.json({
      ok: true,
      event: {
        ...event,
        aircraft_image_url: aircraftPublicUrl(event.aircraft_image_path),
        map_image_url: mapPublicUrl(event.map_image_path),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
