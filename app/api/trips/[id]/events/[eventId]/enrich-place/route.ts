import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyHotelPlaceEnrichment,
  searchHotelPlaces,
  type PlaceCandidate,
} from "@/lib/trips/enrich-hotel";
import {
  aircraftPublicUrl,
  mapPublicUrl,
} from "@/lib/trips/cover";
import { getTripEventById } from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; eventId: string }> };

const BodySchema = z.object({
  query: z.string().optional(),
  candidate: z
    .object({
      osmId: z.string(),
      name: z.string(),
      displayName: z.string(),
      address: z.string().nullable(),
      phone: z.string().nullable(),
      website: z.string().nullable(),
      lat: z.number(),
      lon: z.number(),
    })
    .optional(),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const eventId = Number(eventIdRaw);
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }

    const body = BodySchema.parse(await request.json().catch(() => ({})));

    if (body.candidate) {
      const event = await applyHotelPlaceEnrichment(
        eventId,
        body.candidate as PlaceCandidate
      );
      return NextResponse.json({
        ok: true,
        event: {
          ...event,
          aircraft_image_url: aircraftPublicUrl(event.aircraft_image_path),
          map_image_url: mapPublicUrl(event.map_image_path),
        },
      });
    }

    const candidates = await searchHotelPlaces(eventId, body.query);
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
