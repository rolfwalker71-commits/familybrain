import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgendaAiIconKey,
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

test("drive prompt asks for Tiguan, Uri plate and one illustrated map", () => {
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
  assert.match(prompt, /UR · 15716/);
  assert.match(prompt, /Uri canton/i);
  assert.match(prompt, /exactly one illustrated destination map/i);
  assert.match(prompt, /12\.4 km/);
  assert.match(prompt, /15 Min/);
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

test("online Teams meeting uses title, notes and topic visuals", () => {
  const subject = {
    title: "AI Wochencall",
    location: "Microsoft Teams Besprechung",
    meetUrl: "https://teams.microsoft.com/l/meetup-join/x",
    description: "Themen: Modelle, Prompting, Buddy",
    calendarType: "work",
    calendarName: "Kalender",
    time: "09:00",
    endTime: "09:30",
  };
  assert.equal(isOnlineAgendaMeeting(subject), true);
  assert.equal(hasDriveAgendaContext(subject), false);
  const prompt = buildAgendaAiIconPrompt(subject);
  assert.match(prompt, /AI Wochencall/);
  assert.match(prompt, /Themen: Modelle/);
  assert.match(prompt, /AI theme/i);
  assert.match(prompt, /laptop/i);
  assert.doesNotMatch(prompt, /ONLY text/i);
  assert.doesNotMatch(prompt, /Tiguan/i);
  assert.match(prompt, /adult man/i);
});

test("online recurring meetings share cache key across times", () => {
  const base = {
    title: "AI Wochencall",
    location: "Microsoft Teams Besprechung",
    meetUrl: "https://teams.microsoft.com/l/meetup-join/x",
    calendarType: "work",
    calendarName: "Kalender",
  };
  const a = buildAgendaAiIconKey({ ...base, time: "09:00", endTime: "09:30" });
  const b = buildAgendaAiIconKey({ ...base, time: "10:00", endTime: "10:30" });
  assert.ok(a);
  assert.equal(a, b);
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
