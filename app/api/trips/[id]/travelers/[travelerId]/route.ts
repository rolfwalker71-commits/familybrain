import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  deleteTripTraveler,
  getTripTravelerById,
  updateTripTraveler,
} from "@/lib/trips/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; travelerId: string }> };

const PatchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  userId: z.number().int().positive().nullable().optional(),
  sortKey: z.number().int().optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id: idRaw, travelerId: travelerRaw } = await context.params;
    const tripId = Number(idRaw);
    const travelerId = Number(travelerRaw);
    if (
      !Number.isInteger(tripId) ||
      tripId <= 0 ||
      !Number.isInteger(travelerId) ||
      travelerId <= 0
    ) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    const existing = getTripTravelerById(travelerId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Reisende nicht gefunden" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const email =
      parsed.data.email === undefined
        ? undefined
        : parsed.data.email === "" || parsed.data.email == null
          ? null
          : parsed.data.email;
    const traveler = updateTripTraveler(travelerId, {
      displayName: parsed.data.displayName,
      email,
      userId: parsed.data.userId,
      sortKey: parsed.data.sortKey,
    });
    return NextResponse.json({ ok: true, traveler });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id: idRaw, travelerId: travelerRaw } = await context.params;
    const tripId = Number(idRaw);
    const travelerId = Number(travelerRaw);
    if (
      !Number.isInteger(tripId) ||
      tripId <= 0 ||
      !Number.isInteger(travelerId) ||
      travelerId <= 0
    ) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    const existing = getTripTravelerById(travelerId);
    if (!existing || existing.trip_id !== tripId) {
      return NextResponse.json({ error: "Reisende nicht gefunden" }, { status: 404 });
    }
    deleteTripTraveler(travelerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
