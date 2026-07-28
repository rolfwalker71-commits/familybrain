import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import { enrichTrainEvent } from "@/lib/trips/enrich-train";
import { getTripEventById } from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function POST(_request: Request, context: Ctx) {
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
    const result = await enrichTrainEvent(eventId);
    return NextResponse.json({
      ok: true,
      event: serializeTripEvent(result.event),
      warning: result.warning || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
