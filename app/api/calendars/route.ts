import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  deleteIcsCalendar,
  ICS_CALENDAR_TYPES,
  ICS_TYPE_META,
  listIcsCalendars,
  setIcsCalendarEnabled,
  upsertIcsCalendar,
} from "@/lib/calendar/ics-calendars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpsertSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80),
  url: z.string().url().max(2000),
  enabled: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  type: z.enum(ICS_CALENDAR_TYPES).optional(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    calendars: listIcsCalendars(),
    types: ICS_CALENDAR_TYPES.map((id) => ({
      id,
      label: ICS_TYPE_META[id].label,
      defaultColor: ICS_TYPE_META[id].defaultColor,
    })),
  });
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const parsed = UpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Kalender-Daten (Name, URL, …)." },
        { status: 400 }
      );
    }
    const calendars = upsertIcsCalendar(parsed.data);
    return NextResponse.json({ ok: true, calendars });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = (await request.json()) as {
      id?: string;
      enabled?: boolean;
    };
    if (!body.id || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "id und enabled erforderlich." },
        { status: 400 }
      );
    }
    const calendars = setIcsCalendarEnabled(body.id, body.enabled);
    return NextResponse.json({ ok: true, calendars });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }
  const calendars = deleteIcsCalendar(id);
  return NextResponse.json({ ok: true, calendars });
}
