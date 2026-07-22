import type { CalendarEvent } from "@/lib/utils/ics";
import type { TripEventRow, TripRow } from "@/lib/trips/queries";

export function tripEventsToCalendarEvents(
  trip: TripRow,
  events: TripEventRow[]
): CalendarEvent[] {
  return events
    .filter((event) => Boolean(event.start_date))
    .map((event) => {
      const parts = [
        event.provider ? `Anbieter: ${event.provider}` : null,
        event.booking_reference ? `Buchung: ${event.booking_reference}` : null,
        event.flight_number ? `Flug: ${event.flight_number}` : null,
        event.cabin_class ? `Klasse: ${event.cabin_class}` : null,
        event.airline ? `Airline: ${event.airline}` : null,
        event.departure_airport && event.arrival_airport
          ? `${event.departure_airport} → ${event.arrival_airport}`
          : null,
        event.address || event.location,
        event.phone ? `Tel: ${event.phone}` : null,
        event.notes,
        `Reise: ${trip.title}`,
      ].filter(Boolean);

      return {
        uid: `travelbrain-trip-${trip.id}-event-${event.id}@familybrain`,
        title: `${event.event_type}: ${event.title}`,
        description: parts.join("\n"),
        location: event.address || event.location || undefined,
        startDate: event.start_date!,
        endDate: event.end_date || event.start_date || undefined,
        startTime: event.start_time || undefined,
        endTime: event.end_time || undefined,
        url: event.website || undefined,
      } satisfies CalendarEvent;
    });
}
