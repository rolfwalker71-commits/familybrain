import assert from "node:assert/strict";
import test from "node:test";
import { shouldAnalyzeMail } from "@/lib/mail/mail-heuristic";
import { MailAnalysisSchema } from "@/lib/mail/mail-action-schema";
import {
  findConflictsAgainstProposed,
  timedWindowMinutes,
} from "@/lib/calendar/event-overlap";
import { emailDomain, senderPrefPromptLine } from "@/lib/mail/mail-sender-prefs";

test("soft learn: applied domain forces analyze even without keywords", () => {
  assert.equal(
    shouldAnalyzeMail(
      {
        from: "noreply@shop.example",
        fromName: "Shop",
        subject: "Status update",
        snippet: "Hello",
      },
      { appliedCount: 2, dismissedCount: 0 }
    ),
    true
  );
});

test("soft learn: dismissed domain skips weak mail", () => {
  assert.equal(
    shouldAnalyzeMail(
      {
        from: "promo@noise.example",
        fromName: "Noise",
        subject: "Hello there",
        snippet: "Nothing special",
      },
      { appliedCount: 0, dismissedCount: 3 }
    ),
    false
  );
});

test("soft learn: INTEREST still wins over dismiss", () => {
  assert.equal(
    shouldAnalyzeMail(
      {
        from: "mcinfo@ups.com",
        fromName: "UPS",
        subject: "Paketlieferung",
        snippet: "Zustellung morgen",
      },
      { appliedCount: 0, dismissedCount: 5 }
    ),
    true
  );
});

test("emailDomain extracts host", () => {
  assert.equal(emailDomain("MCInfo@UPS.com"), "ups.com");
  assert.equal(emailDomain("bad"), null);
});

test("senderPrefPromptLine for applied", () => {
  const line = senderPrefPromptLine({
    userId: 1,
    fromDomain: "ups.com",
    appliedCount: 2,
    dismissedCount: 0,
    lastAppliedAt: null,
    lastDismissedAt: null,
  });
  assert.match(line || "", /oft übernommen/);
});

test("MailAnalysisSchema accepts replyDraft and patchEventId", () => {
  const parsed = MailAnalysisSchema.parse({
    summary: "Lieferfenster geändert",
    relevance: "high",
    replyDraft: {
      subject: "Re: UPS",
      body: "Danke, bitte an die Haustür liefern.",
      tone: "kurz",
    },
    suggestions: [
      {
        kind: "event",
        title: "UPS Paketlieferung - shop.ch",
        startDate: "2026-08-11",
        startTime: "09:00",
        endTime: "12:00",
        patchEventId: "evt123",
        calendarId: "primary",
      },
    ],
  });
  assert.equal(parsed.replyDraft?.body.includes("Haustür"), true);
  assert.equal(parsed.suggestions[0]?.patchEventId, "evt123");
});

test("timedWindowMinutes and conflict against proposed", () => {
  const w = timedWindowMinutes({ time: "09:00", endTime: "12:00" });
  assert.deepEqual(w, { start: 9 * 60, end: 12 * 60 });
  const hits = findConflictsAgainstProposed(
    [
      {
        id: "a",
        title: "F2 Früh",
        date: "2026-08-11",
        time: "06:30",
        endTime: "15:24",
      },
    ],
    {
      id: "mail:ups",
      title: "UPS",
      date: "2026-08-11",
      time: "09:00",
      endTime: "12:00",
    }
  );
  assert.equal(hits.length, 1);
  assert.match(hits[0]!.label, /UPS/);
});
