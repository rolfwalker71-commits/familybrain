import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { verifyConfiguredPassword } from "./password";
import {
  clearLoginFailures,
  loginRateLimitStatus,
  recordLoginFailure,
} from "./rate-limit";
import {
  createSessionToken,
  verifySessionToken,
} from "./session";

const secret = "a-secure-test-secret-with-more-than-32-characters";

test("session tokens verify and expire", async () => {
  const now = Date.UTC(2026, 6, 19);
  const token = await createSessionToken("admin", secret, now);
  assert.equal(
    (await verifySessionToken(token, secret, "admin", now + 1000))?.username,
    "admin"
  );
  assert.equal(await verifySessionToken(token, secret, "other", now), null);
  assert.equal(
    await verifySessionToken(`${token}tampered`, secret, "admin", now),
    null
  );
  assert.equal(
    await verifySessionToken(token, secret, "admin", now + 31 * 24 * 60 * 60 * 1000),
    null
  );
});

test("plain and scrypt configured passwords verify", async () => {
  assert.equal(
    await verifyConfiguredPassword("admin", "correct horse", {
      username: "admin",
      password: "correct horse",
      passwordHash: null,
    }),
    true
  );

  const salt = "test-salt";
  const hash = scryptSync("battery staple", salt, 64).toString("base64url");
  assert.equal(
    await verifyConfiguredPassword("rolf", "battery staple", {
      username: "rolf",
      password: null,
      passwordHash: `scrypt:${salt}:${hash}`,
    }),
    true
  );
  assert.equal(
    await verifyConfiguredPassword("rolf", "wrong", {
      username: "rolf",
      password: null,
      passwordHash: `scrypt:${salt}:${hash}`,
    }),
    false
  );
});

test("login rate limiter blocks after five failures", () => {
  const key = "test-client";
  clearLoginFailures(key);
  for (let index = 0; index < 5; index += 1) {
    recordLoginFailure(key, 1000 + index);
  }
  assert.equal(loginRateLimitStatus(key, 2000).allowed, false);
  clearLoginFailures(key);
  assert.equal(loginRateLimitStatus(key, 2000).allowed, true);
});
