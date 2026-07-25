import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import {
  createTripTraveler,
  getTripById,
  listTripTravelers,
} from "@/lib/trips/queries";
import { getAppUserById, grantTripAccess } from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CreateSchema = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    email: z.string().email().nullable().optional().or(z.literal("")),
    userId: z.number().int().positive().optional(),
  })
  .refine((v) => Boolean(v.userId) || Boolean(v.displayName?.trim()), {
    message: "Name oder Benutzer erforderlich",
  });

export async function GET(_request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const tripId = Number(idRaw);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const auth = await requireTripAccess(tripId);
  if (isAuthError(auth)) return auth;
  if (!getTripById(tripId)) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ travelers: listTripTravelers(tripId) });
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const tripId = Number(idRaw);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireTripAccess(tripId);
    if (isAuthError(auth)) return auth;
    if (!getTripById(tripId)) {
      return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
    }
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    let displayName = parsed.data.displayName?.trim() || "";
    let email: string | null =
      typeof parsed.data.email === "string" && parsed.data.email.trim()
        ? parsed.data.email.trim()
        : null;
    let userId = parsed.data.userId ?? null;

    if (userId) {
      const user = getAppUserById(userId);
      if (!user || !user.active) {
        return NextResponse.json(
          { error: "Benutzer nicht gefunden" },
          { status: 404 }
        );
      }
      displayName = user.display_name || user.username;
      email = user.email || email;
    }

    const traveler = createTripTraveler(tripId, {
      displayName,
      email,
      userId,
    });
    if (userId) {
      grantTripAccess(userId, tripId);
    }
    return NextResponse.json({ ok: true, traveler });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
