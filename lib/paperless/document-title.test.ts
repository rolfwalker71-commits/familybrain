import assert from "node:assert/strict";
import test from "node:test";
import { clipSuggestedDocumentTitle } from "@/lib/paperless/document-title";

test("clipSuggestedDocumentTitle trims and rejects junk", () => {
  assert.equal(clipSuggestedDocumentTitle("  Kaufvertrag Grundstück  "), "Kaufvertrag Grundstück");
  assert.equal(clipSuggestedDocumentTitle("ab"), null);
  assert.equal(clipSuggestedDocumentTitle(null), null);
  const long = "A".repeat(200);
  const clipped = clipSuggestedDocumentTitle(long, 160);
  assert.ok(clipped);
  assert.equal(clipped!.length, 160);
  assert.ok(clipped!.endsWith("…"));
});
