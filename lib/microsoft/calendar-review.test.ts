import assert from "node:assert/strict";
import test from "node:test";
import {
  findFreeSlots,
  withReschedulePrefix,
  type MsCalendarEvent,
} from "./calendar-review.ts";

function ev(
  partial: Partial<MsCalendarEvent> & {
    id: string;
    startHm: string;
    endHm: string;
  }
): MsCalendarEvent {
  return {
    subject: partial.subject || "X",
    start: `${partial.date || "2026-08-08"}T${partial.startHm}:00`,
    end: `${partial.date || "2026-08-08"}T${partial.endHm}:00`,
    date: partial.date || "2026-08-08",
    location: null,
    isAllDay: false,
    categories: [],
    done: false,
    showAs: "busy",
    webLink: null,
    organizer: null,
    ...partial,
  };
}

test("findFreeSlots finds morning gap before first meeting", () => {
  const slots = findFreeSlots({
    events: [
      ev({ id: "1", date: "2026-08-10", startHm: "10:00", endHm: "11:00" }),
      ev({ id: "2", date: "2026-08-10", startHm: "14:00", endHm: "15:00" }),
    ],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 60,
    workStartHm: "08:00",
    workEndHm: "18:00",
  });
  assert.ok(slots.some((s) => s.startHm === "08:00" && s.endHm === "09:00"));
  assert.ok(slots.some((s) => s.startHm === "11:00"));
});

test("findFreeSlots skips done events as busy blockers", () => {
  const slots = findFreeSlots({
    events: [
      ev({
        id: "1",
        date: "2026-08-10",
        startHm: "09:00",
        endHm: "17:00",
        done: true,
      }),
    ],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 60,
  });
  assert.ok(slots.length >= 1);
  assert.equal(slots[0]?.startHm, "08:00");
});

test("withReschedulePrefix adds arrow once", () => {
  assert.equal(withReschedulePrefix("MorgenCall"), "➡️ MorgenCall");
  assert.equal(withReschedulePrefix("➡️ MorgenCall"), "➡️ MorgenCall");
  assert.equal(withReschedulePrefix("✅ Meeting"), "➡️ ✅ Meeting");
});
