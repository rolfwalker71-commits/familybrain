import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMariMime, isMariImageMime } from "@/lib/mari/attachments";

test("normalizeMariMime maps bare png/jpg to image/*", () => {
  assert.equal(normalizeMariMime("png", "x.png"), "image/png");
  assert.equal(normalizeMariMime("jpg", "x.jpg"), "image/jpeg");
  assert.equal(normalizeMariMime(null, "shot.WEBP"), "image/webp");
});

test("isMariImageMime accepts filename fallback", () => {
  assert.equal(isMariImageMime("application/octet-stream", "a.PNG"), true);
  assert.equal(isMariImageMime("application/pdf", "a.pdf"), false);
});

test("base64 padding length matches Buffer length", () => {
  // Regression: Content-Length used floor(len*3/4) without padding → +1 byte
  // and browsers showed broken image placeholders.
  const padded = Buffer.from("hello world!!").toString("base64"); // ends with =
  assert.ok(padded.endsWith("="));
  const actual = Buffer.from(padded, "base64").length;
  const naive = Math.floor(padded.length * 3 / 4);
  assert.notEqual(naive, actual);
  assert.equal(actual, 13);
});
