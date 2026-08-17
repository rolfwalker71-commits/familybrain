import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEventImagePrompt,
  hasExplicitClockTime,
} from "@/lib/trips/event-image-prompt";

describe("event-image-prompt day trip timing", () => {
  it("detects missing clock times", () => {
    assert.equal(hasExplicitClockTime(null, null), false);
    assert.equal(hasExplicitClockTime("", "  "), false);
    assert.equal(hasExplicitClockTime("09:30", null), true);
    assert.equal(hasExplicitClockTime(null, "18:00"), true);
  });

  it("omits inventable times for Ausflug without start/end time", () => {
    const prompt = buildEventImagePrompt({
      event_type: "Ausflug",
      title: "Museumstag",
      start_date: "2026-08-20",
      start_time: null,
      end_time: null,
      location: "Zürich",
    });
    assert.match(prompt, /Tagesausflug ohne Uhrzeit/);
    assert.match(prompt, /no Abfahrt/);
    assert.doesNotMatch(prompt, /\btimes:\s*\d/);
    assert.doesNotMatch(prompt, /09:|18:/);
  });

  it("includes explicit times when provided", () => {
    const prompt = buildEventImagePrompt({
      event_type: "Ausflug",
      title: "Stadtführung",
      start_date: "2026-08-20",
      start_time: "10:00",
      end_time: "12:00",
    });
    assert.match(prompt, /times:\s*10:00–12:00/);
    assert.doesNotMatch(prompt, /Tagesausflug ohne Uhrzeit/);
  });
});
