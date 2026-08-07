import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { ICS_CALENDAR_TYPES } from "@/lib/calendar/ics-calendars";
import {
  listGoogleCalendarsForUser,
  saveGoogleCalendarSelections,
  type GoogleCalendarSelection,
} from "@/lib/google/calendars";
import {
  hasGoogleCalendarScope,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  selections: z.array(
    z.object({
      id: z.string().min(1).max(500),
      enabled: z.boolean(),
      name: z.string().min(1).max(120).optional(),
      type: z.enum(ICS_CALENDAR_TYPES).optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      planningRelevant: z.boolean().optional(),
    })
  ),
});

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null) {
    return NextResponse.json({
      connected: false,
      hasCalendarScope: false,
      ownerUserId: null,
      calendars: [],
    });
  }
  try {
    const data = await listGoogleCalendarsForUser(userId, request);
    return NextResponse.json({
      ...data,
      ownerUserId: userId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: isGoogleMailConnected(userId),
        hasCalendarScope: hasGoogleCalendarScope(userId),
        ownerUserId: userId,
        calendars: [],
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für Google-Kalender." },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Auswahl" }, { status: 400 });
  }
  const selections: GoogleCalendarSelection[] = parsed.data.selections;
  saveGoogleCalendarSelections(userId, selections);
  try {
    const data = await listGoogleCalendarsForUser(userId, request);
    return NextResponse.json({ ok: true, ownerUserId: userId, ...data });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      ownerUserId: userId,
      connected: isGoogleMailConnected(userId),
      hasCalendarScope: hasGoogleCalendarScope(userId),
      calendars: [],
      warning: error instanceof Error ? error.message : String(error),
    });
  }
}
