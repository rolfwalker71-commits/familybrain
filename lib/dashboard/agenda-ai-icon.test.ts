import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgendaAiIconPrompt,
  hasDriveAgendaContext,
  isBirthdayAgendaSubject,
  isOnlineAgendaMeeting,
  isValentynaWorkCalendar,
  shouldDepictManForWork,
} from "./agenda-ai-icon.ts";

test("birthday prompt has no itinerary panels", () => {
  const prompt = buildAgendaAiIconPrompt({
    title: "Geburtstag Reto Ziegler (51)",
    calendarType: "birthday",
  });
  assert.match(prompt, /birthday celebration/i);
  assert.match(prompt, /Do NOT include any itinerary/i);
  assert.doesNotMatch(prompt, /VW Tiguan/i);
  assert.ok(
    isBirthdayAgendaSubject({ title: "Geburtstagsessen", kind: "calendar" })
  );
});

test("drive prompt asks for Tiguan, distance and map", () => {
  const subject = {
    title: "Mittagessen bei Eltern",
    location: "Efibach 38 Silenen",
    calendarType: "family",
    driveMinutes: 15,
    distanceKm: 12.4,
    coords: { lat: 46.8, lon: 8.6 },
  };
  assert.equal(hasDriveAgendaContext(subject), true);
  const prompt = buildAgendaAiIconPrompt(subject);
  assert.match(prompt, /Volkswagen Tiguan/i);
  assert.match(prompt, /12\.4 km/);
  assert.match(prompt, /15 Min/);
  assert.match(prompt, /map/i);
  assert.match(prompt, /Familie/);
});

test("birthday wins over drive context", () => {
  assert.equal(
    hasDriveAgendaContext({
      title: "Geburtstag Anna",
      calendarType: "birthday",
      location: "Zürich",
      driveMinutes: 40,
      distanceKm: 50,
    }),
    false
  );
});

test("online Teams meeting prompt only emphasizes time", () => {
  const subject = {
    title: "Sync Call",
    location: "Microsoft Teams Besprechung",
    meetUrl: "https://teams.microsoft.com/l/meetup-join/x",
    calendarType: "work",
    calendarName: "Kalender",
    time: "09:00",
    endTime: "09:30",
  };
  assert.equal(isOnlineAgendaMeeting(subject), true);
  assert.equal(hasDriveAgendaContext(subject), false);
  const prompt = buildAgendaAiIconPrompt(subject);
  assert.match(prompt, /09:00–09:30/);
  assert.match(prompt, /ONLY text/i);
  assert.doesNotMatch(prompt, /Tiguan/i);
  assert.match(prompt, /adult man/i);
});

test("Valentyna work calendar skips man depiction", () => {
  assert.ok(isValentynaWorkCalendar("Arbeitsplan Valentyna"));
  assert.equal(
    shouldDepictManForWork({
      title: "F2 Früh",
      calendarType: "work",
      calendarName: "Arbeitsplan Valentyna",
      location: "Kantonsspital Uri, Spitalstrasse 1, 6460 Altdorf",
    }),
    false
  );
  assert.equal(
    shouldDepictManForWork({
      title: "F2 Früh",
      calendarType: "work",
      calendarName: "Arbeit Rolf",
      location: "Kantonsspital Uri, Spitalstrasse 1, 6460 Altdorf",
    }),
    true
  );
});
