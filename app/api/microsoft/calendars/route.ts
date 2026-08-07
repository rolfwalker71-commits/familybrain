import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { ICS_CALENDAR_TYPES } from "@/lib/calendar/ics-calendars";
import {
  listMicrosoftCalendarsForUser,
  saveMicrosoftCalendarSelections,
  type MicrosoftCalendarSelection,
} from "@/lib/microsoft/calendars";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

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

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null) {
    return NextResponse.json({
      connected: false,
      hasCalendarScope: false,
      ownerUserId: null,
      calendars: [],
    });
  }
  try {
    const data = await listMicrosoftCalendarsForUser(userId);
    return NextResponse.json({
      ...data,
      ownerUserId: userId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: isMicrosoftConnected(userId),
        hasCalendarScope: hasMicrosoftCalendarScope(userId),
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
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für Microsoft-Kalender." },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Auswahl" }, { status: 400 });
  }
  const selections: MicrosoftCalendarSelection[] = parsed.data.selections;
  saveMicrosoftCalendarSelections(userId, selections);
  try {
    const data = await listMicrosoftCalendarsForUser(userId);
    return NextResponse.json({ ok: true, ownerUserId: userId, ...data });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      ownerUserId: userId,
      connected: isMicrosoftConnected(userId),
      hasCalendarScope: hasMicrosoftCalendarScope(userId),
      calendars: [],
      warning: error instanceof Error ? error.message : String(error),
    });
  }
}
