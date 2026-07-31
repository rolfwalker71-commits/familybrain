import assert from "node:assert/strict";
import test from "node:test";
import {
  looksLikeLohnabrechnung,
  looksLikeLohnausweis,
} from "@/lib/extraction/tax";

test("Lohnausweis is not Lohnabrechnung", () => {
  assert.equal(looksLikeLohnausweis("Lohnausweis 2025"), true);
  assert.equal(looksLikeLohnabrechnung("Lohnausweis 2025"), false);
});

test("Lohnabrechnung detected", () => {
  assert.equal(looksLikeLohnabrechnung("Lohnabrechnung März 2025"), true);
  assert.equal(looksLikeLohnabrechnung("Gehaltsabrechnung Januar"), true);
  assert.equal(looksLikeLohnabrechnung("Payslip March"), true);
});
