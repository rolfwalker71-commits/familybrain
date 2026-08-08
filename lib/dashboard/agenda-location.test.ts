import assert from "node:assert/strict";
import test from "node:test";
import { isPhysicalAgendaLocation } from "./agenda-location.ts";

test("isPhysicalAgendaLocation rejects online meetings", () => {
  assert.equal(isPhysicalAgendaLocation("Teams Besprechung"), false);
  assert.equal(isPhysicalAgendaLocation("Microsoft Teams"), false);
  assert.equal(isPhysicalAgendaLocation("Zoom Meeting"), false);
  assert.equal(isPhysicalAgendaLocation("https://meet.google.com/abc"), false);
  assert.equal(isPhysicalAgendaLocation("Google Meet"), false);
});

test("isPhysicalAgendaLocation accepts real places", () => {
  assert.equal(
    isPhysicalAgendaLocation("Kantonsspital Uri, Spitalstrasse 1, 6460 Altdorf"),
    true
  );
  assert.equal(isPhysicalAgendaLocation("Efibach 38 Silenen, Schweiz"), true);
  assert.equal(isPhysicalAgendaLocation("Gottardo Arena"), true);
  assert.equal(isPhysicalAgendaLocation("Altdorf"), true);
});
