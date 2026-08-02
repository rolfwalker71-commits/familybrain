import assert from "node:assert/strict";
import test from "node:test";
import {
  isPushMediaPathAllowed,
  verifyPushMediaQuery,
} from "./signed-media.ts";

test("isPushMediaPathAllowed only whitelists media paths", () => {
  assert.equal(
    isPushMediaPathAllowed("/api/documents/media/ai-icon/doc-1.jpg"),
    true
  );
  assert.equal(isPushMediaPathAllowed("/api/trips/media/ai/ev.jpg"), true);
  assert.equal(
    isPushMediaPathAllowed("/api/finance-ledgers/media/ai/x.jpg"),
    true
  );
  assert.equal(isPushMediaPathAllowed("/api/settings"), false);
  assert.equal(
    isPushMediaPathAllowed("/api/documents/media/ai-icon/../secret"),
    false
  );
});

test("verifyPushMediaQuery rejects missing/expired signatures", () => {
  const bad = verifyPushMediaQuery({
    path: "/api/documents/media/ai-icon/doc-1.jpg",
    exp: String(Math.floor(Date.now() / 1000) - 10),
    sig: "nope",
  });
  assert.equal(bad.ok, false);
});
