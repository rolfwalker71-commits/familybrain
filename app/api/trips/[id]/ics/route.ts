import { NextResponse } from "next/server";
import {
  isAuthError,
  requireTripAccess,
} from "@/lib/auth/current-user";
import { tripEventsToCalendarEvents } from "@/lib/trips/ics";
import { getTripById, listTripEvents } from "@/lib/trips/queries";
import { buildIcsCalendar } from "@/lib/utils/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    url.host;
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const proto = forwardedProto || url.protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

export async function GET(request: Request, context: Ctx) {
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const auth = await requireTripAccess(id);
  if (isAuthError(auth)) return auth;
  const trip = getTripById(id);
  if (!trip) {
    return NextResponse.json({ error: "Reise nicht gefunden" }, { status: 404 });
  }
  const calendarEvents = await tripEventsToCalendarEvents(
    trip,
    listTripEvents(id),
    { absoluteOrigin: requestOrigin(request), embedAiImages: true }
  );
  if (calendarEvents.length === 0) {
    return NextResponse.json(
      { error: "Keine datierten Ereignisse für den Kalender-Export." },
      { status: 400 }
    );
  }

  const slug = trip.title
    .toLowerCase()
    .replace(/[^a-z0-9äöü]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const filename = `tripbook-${id}${slug ? `-${slug}` : ""}.ics`;

  return new NextResponse(buildIcsCalendar(calendarEvents), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
