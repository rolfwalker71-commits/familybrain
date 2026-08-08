import assert from "node:assert/strict";
import test from "node:test";
import {
  MICROSOFT_OAUTH_CALLBACK_PATH,
  MICROSOFT_OAUTH_SCOPES,
  parseMicrosoftOauthState,
} from "./oauth.ts";

test("Microsoft scopes include mail + calendar + tasks by default", () => {
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Mail.ReadWrite"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Calendars.ReadWrite"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Tasks.ReadWrite"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("offline_access"));
  assert.ok(!(MICROSOFT_OAUTH_SCOPES as readonly string[]).includes("Chat.ReadWrite"));
  assert.ok(
    !(MICROSOFT_OAUTH_SCOPES as readonly string[]).includes("ChatMessage.Send")
  );
  assert.equal(
    MICROSOFT_OAUTH_CALLBACK_PATH,
    "/api/microsoft/oauth/callback"
  );
});

test("parseMicrosoftOauthState decodes base64url payload", () => {
  const state = Buffer.from(
    JSON.stringify({ u: 42, n: "abc.nonce" }),
    "utf8"
  ).toString("base64url");
  const parsed = parseMicrosoftOauthState(state);
  assert.deepEqual(parsed, { userId: 42, nonce: "abc.nonce" });
  assert.equal(parseMicrosoftOauthState(null), null);
  assert.equal(parseMicrosoftOauthState("not-valid"), null);
});
