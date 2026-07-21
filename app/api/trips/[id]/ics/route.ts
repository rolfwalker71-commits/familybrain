import { NextResponse } from "next/server";
import { tripEventsToCalendarEvents } from "@/lib/trips/ics";
import { getTripById, listTripEvents } from "@/lib/trips/queries";
import { buildIcsCalendar } from "@/lib/utils/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const calendarEvents = tripEventsToCalendarEvents(trip, listTripEvents(id));
  if (calendarEvents.length === 0) {
    return NextResponse.json(
      { error: "Keine datierten Ereignisse für den Kalender-Export." },
      { status: 400 }
    );
  }

  return new NextResponse(buildIcsCalendar(calendarEvents), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="travelbrain-${id}.ics"`,
    },
  });
}
