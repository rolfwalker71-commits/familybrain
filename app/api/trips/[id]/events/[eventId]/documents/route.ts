import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getTripEventById,
  linkTripEventDocument,
  unlinkTripEventDocument,
} from "@/lib/trips/queries";
import { serializeTripEvent } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  documentId: z.number().int().positive(),
});

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function POST(request: Request, context: Ctx) {
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
      return NextResponse.json(
        { error: "Ereignis nicht gefunden" },
        { status: 404 }
      );
    }
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const event = linkTripEventDocument(eventId, parsed.data.documentId);
    return NextResponse.json({ ok: true, event: serializeTripEvent(event) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, context: Ctx) {
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
      return NextResponse.json(
        { error: "Ereignis nicht gefunden" },
        { status: 404 }
      );
    }

    let documentId: number | null = null;
    const url = new URL(request.url);
    const q = url.searchParams.get("documentId");
    if (q) documentId = Number(q);
    if (documentId == null || !Number.isInteger(documentId)) {
      try {
        const body = BodySchema.safeParse(await request.json());
        if (body.success) documentId = body.data.documentId;
      } catch {
        /* empty body ok */
      }
    }
    if (documentId == null || !Number.isInteger(documentId) || documentId <= 0) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const event = unlinkTripEventDocument(eventId, documentId);
    return NextResponse.json({ ok: true, event: serializeTripEvent(event) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
