import assert from "node:assert/strict";
import test from "node:test";
import {
  findFreeSlots,
  isAllowedWorkSlot,
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
  assert.ok(slots.some((s) => s.startHm === "11:00" && s.endHm === "12:00"));
  assert.ok(slots.some((s) => s.startHm === "13:00"));
});

test("findFreeSlots skips lunch 12-13 and never ends after 18", () => {
  const slots = findFreeSlots({
    events: [],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 60,
    maxSlots: 40,
    stepMinutes: 30,
  });
  assert.ok(slots.length > 0);
  for (const s of slots) {
    assert.ok(
      isAllowedWorkSlot(s),
      `unexpected slot ${s.startHm}-${s.endHm}`
    );
    assert.ok(s.startHm < "12:00" || s.startHm >= "13:00");
    assert.ok(s.endHm <= "18:00");
    assert.ok(!(s.startHm < "13:00" && s.endHm > "12:00" && s.startHm >= "12:00"));
  }
  assert.ok(!slots.some((s) => s.startHm === "12:00"));
  assert.ok(!slots.some((s) => s.startHm === "12:30"));
  assert.ok(!slots.some((s) => s.endHm > "18:00"));
});

test("findFreeSlots does not propose 90min over lunch", () => {
  const slots = findFreeSlots({
    events: [
      ev({ id: "1", date: "2026-08-10", startHm: "08:00", endHm: "11:00" }),
    ],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 90,
    maxSlots: 20,
  });
  assert.ok(!slots.some((s) => s.startHm === "11:00"));
  assert.ok(slots.every((s) => isAllowedWorkSlot(s)));
});

test("findFreeSlots respects occupied busy slots", () => {
  const slots = findFreeSlots({
    events: [
      ev({ id: "1", date: "2026-08-10", startHm: "09:00", endHm: "10:00" }),
      ev({ id: "2", date: "2026-08-10", startHm: "15:00", endHm: "17:30" }),
    ],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 60,
    maxSlots: 30,
  });
  for (const s of slots) {
    const start = s.startHm;
    const end = s.endHm;
    assert.ok(!(start < "10:00" && end > "09:00"), `overlap morning ${start}-${end}`);
    assert.ok(!(start < "17:30" && end > "15:00"), `overlap afternoon ${start}-${end}`);
  }
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
        showAs: "free",
      }),
    ],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 60,
  });
  assert.ok(slots.length >= 1);
  assert.equal(slots[0]?.startHm, "08:00");
});

test("isAllowedWorkSlot rejects lunch and late ends", () => {
  assert.equal(
    isAllowedWorkSlot({ startHm: "11:00", endHm: "12:00" }),
    true
  );
  assert.equal(
    isAllowedWorkSlot({ startHm: "11:30", endHm: "12:30" }),
    false
  );
  assert.equal(
    isAllowedWorkSlot({ startHm: "12:00", endHm: "13:00" }),
    false
  );
  assert.equal(
    isAllowedWorkSlot({ startHm: "17:30", endHm: "18:30" }),
    false
  );
  assert.equal(
    isAllowedWorkSlot({ startHm: "17:00", endHm: "18:00" }),
    true
  );
});

test("findFreeSlots skips starts before notBefore on that day", () => {
  const slots = findFreeSlots({
    events: [],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 60,
    maxSlots: 40,
    notBefore: { date: "2026-08-10", hm: "14:00" },
  });
  assert.ok(slots.length > 0);
  assert.ok(slots.every((s) => s.startHm >= "14:00"));
  assert.ok(!slots.some((s) => s.startHm === "08:00"));
});

test("findFreeSlots shorter duration finds tighter gaps", () => {
  const events = [
    ev({ id: "1", date: "2026-08-10", startHm: "08:00", endHm: "11:00" }),
    ev({ id: "2", date: "2026-08-10", startHm: "12:00", endHm: "13:00" }),
    ev({ id: "3", date: "2026-08-10", startHm: "13:45", endHm: "18:00" }),
  ];
  const long = findFreeSlots({
    events,
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 90,
    maxSlots: 20,
  });
  const short = findFreeSlots({
    events,
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-10",
    durationMinutes: 30,
    maxSlots: 20,
  });
  assert.ok(short.length >= long.length);
  assert.ok(short.some((s) => s.startHm === "13:00" && s.endHm === "13:30"));
  assert.ok(!long.some((s) => s.startHm === "13:00"));
  assert.ok(short.every((s) => s.durationMinutes === 30));
});

test("findFreeSlots maxSlotsPerDay spreads across the week", () => {
  const slots = findFreeSlots({
    events: [],
    rangeStart: "2026-08-10",
    rangeEnd: "2026-08-16",
    durationMinutes: 15,
    maxSlots: 48,
    maxSlotsPerDay: 3,
  });
  const byDay = new Map<string, number>();
  for (const s of slots) {
    byDay.set(s.date, (byDay.get(s.date) || 0) + 1);
  }
  assert.ok(byDay.size >= 5, `expected many days, got ${byDay.size}`);
  for (const count of byDay.values()) {
    assert.ok(count <= 3);
  }
});

test("withReschedulePrefix adds arrow once", () => {
  assert.equal(withReschedulePrefix("MorgenCall"), "➡️ MorgenCall");
  assert.equal(withReschedulePrefix("➡️ MorgenCall"), "➡️ MorgenCall");
  assert.equal(withReschedulePrefix("✅ Meeting"), "➡️ ✅ Meeting");
});
