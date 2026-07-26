import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTripEventCalendarDescription, tripEventsToCalendarEvents } from "./ics";
import { tripEventTypeEmoji } from "./constants";
import type { TripEventRow, TripRow } from "./queries";
import { buildIcsCalendar } from "@/lib/utils/ics";

function baseTrip(over: Partial<TripRow> = {}): TripRow {
  return {
    id: 1,
    title: "Ferien 2026",
    status: "planned",
    start_date: "2026-10-01",
    end_date: "2026-10-20",
    destination: "Florida",
    summary: "Kreuzfahrt Barcelona → Florida",
    cover_path: null,
    cover_prompt: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function baseEvent(over: Partial<TripEventRow> = {}): TripEventRow {
  return {
    id: 10,
    trip_id: 1,
    event_type: "Flug",
    title: "ZRH → MIA",
    start_date: "2026-10-25",
    end_date: "2026-10-25",
    start_time: "10:00",
    end_time: "16:00",
    location: null,
    provider: "Swiss",
    booking_reference: "ABC123",
    notes: "Fensterplatz",
    sort_key: 1,
    document_id: null,
    travel_item_id: null,
    guide_id: null,
    note_id: null,
    source_excerpt: null,
    flight_number: "LX64",
    cabin_class: "Economy",
    airline: "SWISS",
    aircraft_reg: "HB-JHK",
    aircraft_type: "A330",
    departure_airport: "ZRH",
    arrival_airport: "MIA",
    duration_minutes: 600,
    aircraft_image_path: null,
    departure_terminal: "1",
    arrival_terminal: null,
    departure_gate: "A12",
    arrival_gate: null,
    check_in_desk: null,
    baggage_belt: null,
    departure_lat: null,
    departure_lon: null,
    arrival_lat: null,
    arrival_lon: null,
    origin_place: null,
    destination_place: null,
    place_name: null,
    address: null,
    phone: null,
    website: "https://example.com",
    lat: 47.45,
    lon: 8.55,
    map_image_path: null,
    osm_id: null,
    enrichment_json: null,
    enriched_at: null,
    document_notes_md: "## Check-in\nBitte **früh** da sein.",
    show_document_notes: 1,
    document_notes_enriched_at: null,
    ai_image_path: "/tmp/fake-ai.jpg",
    ai_image_prompt: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("trip calendar ICS description", () => {
  it("maps event types to semantic emojis like the UI icons", () => {
    assert.equal(tripEventTypeEmoji("Flug"), "✈️");
    assert.equal(tripEventTypeEmoji("Zugreisen"), "🚆");
    assert.equal(tripEventTypeEmoji("Hotel"), "🏨");
    assert.equal(tripEventTypeEmoji("Kreuzfahrt"), "🚢");
    assert.equal(tripEventTypeEmoji("Mietauto"), "🚗");
    assert.equal(tripEventTypeEmoji("Transfer"), "🚌");
    assert.equal(tripEventTypeEmoji("Ausflug"), "📍");
  });

  it("prefixes SUMMARY with the type emoji", async () => {
    const events = await tripEventsToCalendarEvents(
      baseTrip(),
      [baseEvent({ ai_image_path: null })],
      { embedAiImages: false }
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "✈️ Flug: ZRH → MIA");
  });

  it("includes flight context, notes, and document notes", () => {
    const desc = buildTripEventCalendarDescription(baseTrip(), baseEvent(), {
      aiImageAttached: true,
    });
    assert.match(desc, /Reise: Ferien 2026/);
    assert.match(desc, /Ziel: Florida/);
    assert.match(desc, /Route: ZRH → MIA/);
    assert.match(desc, /Flug: LX64/);
    assert.match(desc, /Abflug: Terminal 1 · Gate A12/);
    assert.match(desc, /Dauer: 600 Min/);
    assert.match(desc, /Notizen:\nFensterplatz/);
    assert.match(desc, /Beleg-Notizen:/);
    assert.match(desc, /früh/);
    assert.match(desc, /KI-Bild: als Kalender-Anhang eingebettet/);
    assert.doesNotMatch(desc, /\*\*/);
  });

  it("emits GEO CATEGORIES and binary ATTACH in ICS", () => {
    const ics = buildIcsCalendar([
      {
        uid: "test@tripbook",
        title: "Flug: ZRH → MIA",
        startDate: "2026-10-25",
        startTime: "10:00",
        endTime: "16:00",
        description: "Test",
        categories: ["Flug"],
        geo: { lat: 47.45, lon: 8.55 },
        attachments: [
          {
            dataBase64: "AQID",
            mimeType: "image/jpeg",
            filename: "ai.jpg",
          },
        ],
      },
    ]);
    assert.match(ics, /CATEGORIES:Flug/);
    assert.match(ics, /GEO:47\.45;8\.55/);
    assert.match(ics, /ATTACH;FMTTYPE=image\/jpeg;ENCODING=BASE64;VALUE=BINARY/);
    assert.match(ics, /AQID/);
  });
});
