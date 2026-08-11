import assert from "node:assert/strict";
import test from "node:test";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";

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
