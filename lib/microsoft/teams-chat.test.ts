import assert from "node:assert/strict";
import test from "node:test";
import { TEAMS_SELF_CHAT_ID } from "./teams-chat.ts";

test("Teams self chat id is Notes chat", () => {
  assert.equal(TEAMS_SELF_CHAT_ID, "48:notes");
});
