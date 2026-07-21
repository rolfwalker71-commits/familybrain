import { NextResponse } from "next/server";
import { z } from "zod";
import {
  coverPublicUrl,
} from "@/lib/trips/cover";
import { TRIP_STATUSES } from "@/lib/trips/constants";
import {
  deleteTrip,
  getTripById,
  listTripEvents,
  updateTrip,
} from "@/lib/trips/queries";
import { serializeTripEvents } from "@/lib/trips/serialize-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const trip = getTripById(id);
  if (!trip) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({
    trip: { ...trip, cover_url: coverPublicUrl(trip.cover_path) },
    events: serializeTripEvents(listTripEvents(id)),
  });
}

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(TRIP_STATUSES).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const trip = updateTrip(id, parsed.data);
    return NextResponse.json({
      ok: true,
      trip: { ...trip, cover_url: coverPublicUrl(trip.cover_path) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    deleteTrip(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
