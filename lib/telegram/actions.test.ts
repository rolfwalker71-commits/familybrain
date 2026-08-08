import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchTextToMessageAction } from "./actions.ts";
import type { TelegramActionPayload } from "./action-tokens.ts";

describe("matchTextToMessageAction", () => {
  const actions: Array<{ token: string; payload: TelegramActionPayload }> = [
    {
      token: "pay1",
      payload: {
        type: "doc_triage",
        documentLocalId: 1,
        action: "pay",
      },
    },
    {
      token: "ign1",
      payload: {
        type: "doc_triage",
        documentLocalId: 1,
        action: "ignore",
      },
    },
    {
      token: "sno1",
      payload: {
        type: "doc_triage",
        documentLocalId: 1,
        action: "snooze",
      },
    },
    {
      token: "cal1",
      payload: {
        type: "cal_done",
        provider: "google",
        calendarId: "primary",
        eventId: "abc",
        title: "Standup",
      },
    },
  ];

  it("maps zahlen / irrelevant / später", () => {
    assert.equal(matchTextToMessageAction("zahlen", actions), "pay1");
    assert.equal(matchTextToMessageAction("irrelevant", actions), "ign1");
    assert.equal(matchTextToMessageAction("später", actions), "sno1");
  });

  it("prefers calendar done for erledigt", () => {
    assert.equal(matchTextToMessageAction("erledigt", actions), "cal1");
  });
});
