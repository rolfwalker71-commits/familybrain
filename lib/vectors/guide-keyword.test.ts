import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeGuideQuery } from "@/lib/vectors/guide-keyword";

test("tokenizeGuideQuery keeps SP + patch number", () => {
  const tokens = tokenizeGuideQuery("Was ist SP 2605?");
  assert.ok(tokens.includes("sp"));
  assert.ok(tokens.includes("2605"));
  assert.ok(tokens.includes("sp2605"));
});

test("tokenizeGuideQuery keeps glued identifiers", () => {
  const tokens = tokenizeGuideQuery("FP2505 installieren");
  assert.ok(tokens.includes("fp"));
  assert.ok(tokens.includes("2505"));
  assert.ok(tokens.includes("fp2505"));
});
