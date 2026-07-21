import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getTripById,
  reorderTripEvents,
} from "@/lib/trips/queries";
import { serializeTripEvents } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  orderedEventIds: z.array(z.number().int().positive()).min(1),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const events = reorderTripEvents(tripId, parsed.data.orderedEventIds);
    return NextResponse.json({
      ok: true,
      events: serializeTripEvents(events),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden")
      ? 404
      : message.includes("Ungültige")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
