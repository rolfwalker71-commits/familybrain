import assert from "node:assert/strict";
import test from "node:test";
import {
  daysUntil,
  dueUrgency,
  formatDueRelative,
  formatExpiryRelative,
} from "./due-urgency.ts";

const TODAY = "2026-07-29";

test("daysUntil: overdue, today, future", () => {
  assert.equal(daysUntil("2026-07-21", TODAY), -8);
  assert.equal(daysUntil("2026-07-29", TODAY), 0);
  assert.equal(daysUntil("2026-08-02", TODAY), 4);
  assert.equal(daysUntil(null, TODAY), null);
  assert.equal(daysUntil("not-a-date", TODAY), null);
});

test("dueUrgency buckets", () => {
  assert.equal(dueUrgency("2026-07-20", TODAY), "overdue");
  assert.equal(dueUrgency("2026-07-29", TODAY), "today");
  assert.equal(dueUrgency("2026-08-02", TODAY), "week");
  assert.equal(dueUrgency("2026-08-20", TODAY), "month");
  assert.equal(dueUrgency("2026-10-01", TODAY), "later");
  assert.equal(dueUrgency(null, TODAY), "none");
});

test("formatDueRelative German labels", () => {
  assert.equal(formatDueRelative("2026-07-21", TODAY), "8 Tage überfällig");
  assert.equal(formatDueRelative("2026-07-28", TODAY), "1 Tag überfällig");
  assert.equal(formatDueRelative("2026-07-29", TODAY), "Heute fällig");
  assert.equal(formatDueRelative("2026-07-30", TODAY), "Morgen fällig");
  assert.equal(formatDueRelative("2026-08-02", TODAY), "In 4 Tagen fällig");
});

test("formatExpiryRelative German labels", () => {
  assert.equal(
    formatExpiryRelative("2026-09-25", TODAY),
    "Läuft in 58 Tagen ab"
  );
  assert.equal(formatExpiryRelative("2026-07-29", TODAY), "Läuft heute ab");
  assert.equal(
    formatExpiryRelative("2026-07-20", TODAY),
    "Seit 9 Tagen abgelaufen"
  );
});
