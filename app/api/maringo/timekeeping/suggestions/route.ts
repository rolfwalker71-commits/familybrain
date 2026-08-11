import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import {
  listPendingMariCalendarStamps,
  updateMariCalendarStampStatus,
} from "@/lib/mari/calendar-stamp";
import { zurichYmd } from "@/lib/microsoft/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  eventProvider: z.enum(["microsoft", "google"]),
  eventId: z.string().trim().min(1),
  status: z.enum(["booked", "dismissed"]),
  bookedLineId: z.number().int().positive().optional().nullable(),
});

/** Pending Maringo→calendar stamps for evening time-booking review. */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim() || null;
  const mode = url.searchParams.get("mode") || "evening";
  const today = zurichYmd();

  const stamps =
    mode === "day" && date
      ? listPendingMariCalendarStamps({ onDate: date })
      : listPendingMariCalendarStamps({
          onOrBeforeDate: date || today,
        });

  return NextResponse.json({
    ok: true,
    today,
    count: stamps.length,
    suggestions: stamps.map((s) => ({
      eventProvider: s.eventProvider,
      eventId: s.eventId,
      calendarId: s.calendarId,
      issueId: s.issueId,
      eventDate: s.eventDate,
      startHm: s.startHm,
      endHm: s.endHm,
      title: s.title,
      memo: s.memo,
      hours: s.hours,
      href: `/maringo?open=${s.issueId}`,
    })),
  });
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
      { status: 400 }
    );
  }

  const updated = updateMariCalendarStampStatus({
    eventProvider: body.eventProvider,
    eventId: body.eventId,
    status: body.status,
    bookedLineId: body.bookedLineId ?? null,
  });
  if (!updated) {
    return NextResponse.json({ error: "Vorschlag nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, stamp: updated });
}
