import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePathSegment } from "@/lib/google/drive";

test("sanitizePathSegment strips illegal Drive chars", () => {
  const out = sanitizePathSegment('Rechnungen/Q1: "A"', "x");
  assert.ok(!/[\\/:*?"<>|]/.test(out));
  assert.match(out, /Rechnungen/);
  assert.equal(sanitizePathSegment("   ", "Sonstiges"), "Sonstiges");
});
