import assert from "node:assert/strict";
import test from "node:test";
import {
  documentDateKey,
  DUPLICATE_SPECIFIC_MIN_LENGTH,
  normalizeDuplicateDescription,
} from "@/lib/documents/duplicates";

test("normalizeDuplicateDescription folds case and whitespace", () => {
  assert.equal(
    normalizeDuplicateDescription("  Rechnung  Swisscom  März  "),
    "rechnung swisscom marz"
  );
  assert.equal(normalizeDuplicateDescription(null), "");
});

test("documentDateKey extracts calendar day", () => {
  assert.equal(documentDateKey("2025-03-15T10:00:00"), "2025-03-15");
  assert.equal(documentDateKey("2025-03-15"), "2025-03-15");
  assert.equal(documentDateKey(null), "");
});

test("generic descriptions are below specificity threshold", () => {
  const generic = normalizeDuplicateDescription("Prämienrechnung");
  assert.ok(generic.length < DUPLICATE_SPECIFIC_MIN_LENGTH);
  const specific = normalizeDuplicateDescription(
    "Prämienrechnung AXA Haushaltversicherung März 2025 CHF 234.50 für Rolf Walker"
  );
  assert.ok(specific.length >= DUPLICATE_SPECIFIC_MIN_LENGTH);
});
