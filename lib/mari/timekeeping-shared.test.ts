import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMariProjectLabel,
  shiftTimePeriodAnchor,
} from "@/lib/mari/timekeeping-shared";

test("formatMariProjectLabel builds Kunde (Projektnummer)", () => {
  assert.equal(
    formatMariProjectLabel("P200000", "Acme AG"),
    "Acme AG (P200000)"
  );
  assert.equal(formatMariProjectLabel("P200000", null), "P200000");
  assert.equal(formatMariProjectLabel("", "Acme AG"), "Acme AG");
  assert.equal(formatMariProjectLabel(null, null), "–");
  assert.equal(
    formatMariProjectLabel("P200000", "Acme AG (P200000)"),
    "Acme AG (P200000)"
  );
});

test("shiftTimePeriodAnchor steps by day week month quarter", () => {
  assert.equal(shiftTimePeriodAnchor("2026-08-11", "day", -1), "2026-08-10");
  assert.equal(shiftTimePeriodAnchor("2026-08-11", "day", 1), "2026-08-12");
  assert.equal(shiftTimePeriodAnchor("2026-08-11", "week", -1), "2026-08-04");
  assert.equal(shiftTimePeriodAnchor("2026-08-15", "month", -1), "2026-07-01");
  assert.equal(shiftTimePeriodAnchor("2026-08-15", "month", 1), "2026-09-01");
  assert.equal(
    shiftTimePeriodAnchor("2026-08-15", "quarter", -1),
    "2026-04-01"
  );
  assert.equal(
    shiftTimePeriodAnchor("2026-08-15", "quarter", 1),
    "2026-10-01"
  );
});
