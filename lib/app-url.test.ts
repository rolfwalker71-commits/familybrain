import assert from "node:assert/strict";
import test from "node:test";
import { absoluteOauthRedirectUrl } from "./app-url.ts";

test("absoluteOauthRedirectUrl prefers live HTTPS host over path-only", () => {
  const req = new Request("https://buddyapp.rolfwalker.ch/settings", {
    headers: {
      host: "buddyapp.rolfwalker.ch",
      "x-forwarded-proto": "https",
    },
  });
  const uri = absoluteOauthRedirectUrl(
    "/api/microsoft/oauth/callback",
    req
  );
  assert.equal(
    uri,
    "https://buddyapp.rolfwalker.ch/api/microsoft/oauth/callback"
  );
});
