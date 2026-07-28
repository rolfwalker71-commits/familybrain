import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  applyTrainConnection,
  applyTrainStation,
  searchTrainConnections,
  searchTrainStations,
} from "@/lib/trips/enrich-train";
import type { OjpTrip } from "@/lib/trips/ojp/types";
import { getTripEventById } from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; eventId: string }> };

const BodySchema = z.object({
  action: z.enum(["search", "apply", "search-station", "apply-station"]).optional(),
  trip: z.custom<OjpTrip>().optional(),
  warning: z.string().optional(),
  query: z.string().optional(),
  target: z.enum(["origin", "destination"]).optional(),
  station: z
    .object({
      stopRef: z.string(),
      name: z.string(),
      displayName: z.string(),
      lat: z.number(),
      lon: z.number(),
    })
    .optional(),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw, eventId: eventIdRaw } = await context.params;
    const tripId = Number(idRaw);
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    const eventId = Number(eventIdRaw);
    const existing = getTripEventById(eventId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Ereignis nicht gefunden" }, { status: 404 });
    }

    const body = BodySchema.parse(await request.json().catch(() => ({})));
    const action = body.action || "search";

    if (action === "search-station") {
      const candidates = await searchTrainStations(body.query || "");
      return NextResponse.json({ ok: true, candidates });
    }

    if (action === "apply-station") {
      if (!body.station || !body.target) {
        return NextResponse.json(
          { error: "Haltestelle und Ziel (Von/Nach) fehlen." },
          { status: 400 }
        );
      }
      const event = await applyTrainStation(eventId, body.target, body.station);
      return NextResponse.json({ ok: true, event: serializeTripEvent(event) });
    }

    if (action === "apply") {
      if (!body.trip) {
        return NextResponse.json(
          { error: "Keine Verbindung ausgewählt." },
          { status: 400 }
        );
      }
      const result = await applyTrainConnection(
        eventId,
        body.trip,
        body.warning || undefined
      );
      return NextResponse.json({
        ok: true,
        event: serializeTripEvent(result.event),
        warning: result.warning || null,
      });
    }

    const result = await searchTrainConnections(eventId);
    return NextResponse.json({
      ok: true,
      options: result.options,
      depArrTimeIso: result.depArrTimeIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
