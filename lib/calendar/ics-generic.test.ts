import assert from "node:assert/strict";
import test from "node:test";
import {
  parseGenericIcsEvents,
  parseIcsDateTimeValue,
} from "@/lib/calendar/ics-generic";
import type { IcsCalendar } from "@/lib/calendar/ics-calendars";

const cal = {
  id: "work",
  name: "Arbeit",
  url: "https://example.test/cal.ics",
  type: "work",
  color: "#0d9488",
  enabled: true,
} as IcsCalendar;

test("TZID W. Europe Standard Time is Zurich wall clock, not UTC+shift", () => {
  // 08:00 in W. Europe in summer = 08:00 Zurich, NOT 10:00
  const d = parseIcsDateTimeValue(
    "20260807T080000",
    "W. Europe Standard Time"
  );
  assert.ok(d);
  const zurich = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d!);
  assert.equal(zurich, "08:00");
});

test("Zulu times convert correctly into Zurich display", () => {
  // 06:00Z in August = 08:00 Zurich (CEST)
  const d = parseIcsDateTimeValue("20260807T060000Z");
  assert.ok(d);
  const zurich = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d!);
  assert.equal(zurich, "08:00");
});

test("O365-style VEVENT MorgenCall shows 08:00 not 10:00", () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:morgen@test
SUMMARY:MorgenCall
DTSTART;TZID=W. Europe Standard Time:20260807T080000
DTEND;TZID=W. Europe Standard Time:20260807T082500
LOCATION:Microsoft Teams-Besprechung
END:VEVENT
END:VCALENDAR`;
  const events = parseGenericIcsEvents(ics, cal);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.time, "08:00");
});
