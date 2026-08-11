import assert from "node:assert/strict";
import test from "node:test";
import { mariStatusSuggestsStaleAuth } from "@/lib/mari/client";

test("mariStatusSuggestsStaleAuth covers opaque MARI failures", () => {
  assert.equal(mariStatusSuggestsStaleAuth(401), true);
  assert.equal(mariStatusSuggestsStaleAuth(403), true);
  assert.equal(mariStatusSuggestsStaleAuth(500), true);
  assert.equal(mariStatusSuggestsStaleAuth(502), true);
  assert.equal(mariStatusSuggestsStaleAuth(503), true);
  assert.equal(mariStatusSuggestsStaleAuth(400), false);
  assert.equal(mariStatusSuggestsStaleAuth(404), false);
  assert.equal(mariStatusSuggestsStaleAuth(200), false);
});
