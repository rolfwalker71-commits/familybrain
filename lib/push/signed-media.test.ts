import assert from "node:assert/strict";
import test from "node:test";
import {
  isPushMediaPathAllowed,
  signedPushMediaPath,
  verifyPushMediaQuery,
  verifyPushMediaToken,
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

test("verifyPushMediaQuery rejects expired signatures", () => {
  const bad = verifyPushMediaQuery({
    path: "/api/documents/media/ai-icon/doc-1.jpg",
    exp: String(Math.floor(Date.now() / 1000) - 10),
    sig: "nope",
  });
  assert.equal(bad.ok, false);
});

test("signedPushMediaPath round-trips via token verifier", () => {
  process.env.FAMILYBRAIN_SESSION_SECRET =
    process.env.FAMILYBRAIN_SESSION_SECRET ||
    "abcdefghijklmnopqrstuvwxyz012345";
  const signed = signedPushMediaPath("/api/documents/media/ai-icon/doc-1.jpg");
  assert.ok(signed);
  const m = /^\/api\/push\/media\/t\/(\d+)\/([^/]+)\/([^/]+)$/.exec(signed!);
  assert.ok(m);
  const verified = verifyPushMediaToken({
    exp: m![1],
    sig: m![2],
    pathEncoded: m![3],
  });
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.path, "/api/documents/media/ai-icon/doc-1.jpg");
  }
});
