import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDuplicateDescription } from "@/lib/documents/duplicates";

test("normalizeDuplicateDescription folds case and whitespace", () => {
  assert.equal(
    normalizeDuplicateDescription("  Rechnung  Swisscom  März  "),
    "rechnung swisscom marz"
  );
  assert.equal(normalizeDuplicateDescription(null), "");
});
