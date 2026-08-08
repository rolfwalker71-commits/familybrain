import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgendaAiIconPrompt,
  hasDriveAgendaContext,
  isBirthdayAgendaSubject,
} from "./agenda-ai-icon.ts";

test("birthday prompt has no itinerary panels", () => {
  const prompt = buildAgendaAiIconPrompt({
    title: "Geburtstag Reto Ziegler (51)",
    calendarType: "birthday",
  });
  assert.match(prompt, /birthday celebration/i);
  assert.match(prompt, /Do NOT include any itinerary/i);
  assert.doesNotMatch(prompt, /VW Tiguan/i);
  assert.ok(isBirthdayAgendaSubject({ title: "Geburtstagsessen", kind: "calendar" }));
});

test("drive prompt asks for Tiguan, distance and map", () => {
  const subject = {
    title: "Mittagessen bei Eltern",
    location: "Efibach 38 Silenen",
    calendarType: "family" as const,
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
