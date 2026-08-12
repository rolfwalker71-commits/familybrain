import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMariProjectLabel,
  normalizeMariDueDate,
  sanitizeMariProjectNumber,
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

test("sanitizeMariProjectNumber rejects customer matchcodes", () => {
  assert.equal(sanitizeMariProjectNumber("P600014"), "P600014");
  assert.equal(
    sanitizeMariProjectNumber("CT-X Holding AG", {
      addressMatchcode: "CT-X Holding AG",
    }),
    null
  );
  assert.equal(
    sanitizeMariProjectNumber("CT-X Holding AG (P600014)"),
    null
  );
  assert.equal(sanitizeMariProjectNumber("C12345", { cardCode: "C12345" }), null);
});

test("normalizeMariDueDate treats MARI sentinel as empty", () => {
  assert.equal(normalizeMariDueDate(null), null);
  assert.equal(normalizeMariDueDate(""), null);
  assert.equal(normalizeMariDueDate("0001-01-01"), null);
  assert.equal(normalizeMariDueDate("0001-01-01T00:00:00"), null);
  assert.equal(normalizeMariDueDate("2026-08-12"), "2026-08-12");
  assert.equal(
    normalizeMariDueDate("2026-08-12T00:00:00"),
    "2026-08-12T00:00:00"
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
