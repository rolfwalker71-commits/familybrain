import type { ItineraryStop } from "@/lib/extraction/itinerary";
import type { CalendarEvent } from "@/lib/utils/ics";
import { parseClockTime } from "@/lib/utils/ics";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöü]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Build one calendar event per stop (timed when times exist). */
export function itineraryStopToCalendarEvent(
  stop: ItineraryStop,
  opts?: { titlePrefix?: string; uidPrefix?: string }
): CalendarEvent | null {
  if (!stop.date) return null;

  const prefix = opts?.titlePrefix || "Anlauf";
  const isSea =
    /cruising|seetag/i.test(stop.location) || stop.note === "Seetag";
  const title = isSea ? `${prefix}: Seetag` : `${prefix}: ${stop.location}`;

  const arrive = parseClockTime(stop.arrive);
  const depart = parseClockTime(stop.depart);

  let startTime: string | undefined;
  let endTime: string | undefined;

  if (arrive && depart) {
    startTime = stop.arrive!;
    endTime = stop.depart!;
  } else if (depart && !arrive) {
    startTime = stop.depart!;
  } else if (arrive && !depart) {
    startTime = stop.arrive!;
  }

  const descParts = [
    stop.day_label ? `Tag: ${stop.day_label}` : null,
    stop.arrive ? `Ankunft: ${stop.arrive}` : null,
    stop.depart ? `Abfahrt: ${stop.depart}` : null,
    stop.note,
  ].filter(Boolean);

  return {
    uid: `${opts?.uidPrefix || "familybrain-anlauf"}-${stop.date}-${slug(stop.location)}@familybrain.local`,
    title,
    location: isSea ? undefined : stop.location,
    description: descParts.join(" · ") || undefined,
    startDate: stop.date,
    startTime,
    endTime,
  };
}

export function itineraryToCalendarEvents(
  stops: ItineraryStop[],
  opts?: { titlePrefix?: string; uidPrefix?: string }
): CalendarEvent[] {
  return stops
    .map((s) => itineraryStopToCalendarEvent(s, opts))
    .filter((e): e is CalendarEvent => Boolean(e));
}
