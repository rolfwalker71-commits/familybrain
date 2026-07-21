import { NextResponse } from "next/server";
import { z } from "zod";
import { coverPublicUrl } from "@/lib/trips/cover";
import { TRIP_STATUSES } from "@/lib/trips/constants";
import { createTrip, listTrips } from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeTrip(trip: ReturnType<typeof listTrips>[number]) {
  return {
    ...trip,
    cover_url: coverPublicUrl(trip.cover_path),
  };
}

export async function GET() {
  return NextResponse.json({
    trips: listTrips().map(serializeTrip),
  });
}

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  status: z.enum(TRIP_STATUSES).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const trip = createTrip(parsed.data);
    return NextResponse.json({ ok: true, trip: serializeTrip(trip) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
