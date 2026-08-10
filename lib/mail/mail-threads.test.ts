import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMailChronikThreads,
  chronikDateTimeLabel,
  isExcludedFromMailAnalysis,
  isMailInSelectedRange,
  mergeMailItemsById,
  summarizeMailThreadCoverage,
} from "@/lib/mail/mail-threads";
import type { MsMailItem } from "@/lib/microsoft/mail-day";

function mail(
  partial: Partial<MsMailItem> & Pick<MsMailItem, "id" | "folder">
): MsMailItem {
  return {
    subject: "Test",
    from: "Sender",
    fromEmail: null,
    toPreview: null,
    toEmails: [],
    receivedOrSentAt: "2026-08-10T10:00:00Z",
    preview: "",
    bodyText: "Hallo",
    conversationId: null,
    webLink: null,
    isRead: true,
    inRange: true,
    ...partial,
  };
}

test("buildMailChronikThreads newest first within and across threads", () => {
  const items = [
    mail({
      id: "a1",
      folder: "inbox",
      conversationId: "t1",
      receivedOrSentAt: "2026-08-09T10:00:00Z",
      inRange: false,
    }),
    mail({
      id: "a2",
      folder: "sent",
      conversationId: "t1",
      receivedOrSentAt: "2026-08-10T12:00:00Z",
      inRange: true,
    }),
    mail({
      id: "b1",
      folder: "inbox",
      conversationId: "t2",
      receivedOrSentAt: "2026-08-10T11:00:00Z",
      inRange: true,
    }),
  ];
  const threads = buildMailChronikThreads(items);
  assert.equal(threads.length, 2);
  assert.equal(threads[0]!.mails[0]!.id, "a2");
  assert.equal(threads[0]!.mails[1]!.id, "a1");
  assert.equal(threads[1]!.mails[0]!.id, "b1");
});

test("isMailInSelectedRange uses Zurich calendar day", () => {
  assert.equal(
    isMailInSelectedRange("2026-08-10T08:00:00+02:00", "2026-08-10", "2026-08-10"),
    true
  );
  assert.equal(
    isMailInSelectedRange("2026-08-09T22:00:00Z", "2026-08-10", "2026-08-10"),
    true
  );
  assert.equal(
    isMailInSelectedRange("2026-08-08T10:00:00Z", "2026-08-10", "2026-08-10"),
    false
  );
});

test("mergeMailItemsById keeps inRange true when either side has it", () => {
  const merged = mergeMailItemsById(
    [mail({ id: "1", folder: "inbox", inRange: true, bodyText: "short" })],
    [mail({ id: "1", folder: "inbox", inRange: false, bodyText: "longer body text" })]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.inRange, true);
  assert.equal(merged[0]!.bodyText, "longer body text");
});

test("chronikDateTimeLabel includes date and time", () => {
  const label = chronikDateTimeLabel("2026-08-10T10:19:00+02:00");
  assert.match(label, /10\.08\.2026/);
  assert.match(label, /10:19/);
});

test("summarizeMailThreadCoverage counts context vs in-range", () => {
  const inbox = [
    mail({
      id: "1",
      folder: "inbox",
      conversationId: "t1",
      inRange: true,
    }),
    mail({
      id: "2",
      folder: "inbox",
      conversationId: "t1",
      inRange: false,
    }),
  ];
  const sent = [
    mail({
      id: "3",
      folder: "sent",
      conversationId: "t2",
      inRange: true,
    }),
  ];
  const cov = summarizeMailThreadCoverage(inbox, sent);
  assert.equal(cov.inRange, 2);
  assert.equal(cov.context, 1);
  assert.equal(cov.threads, 2);
  assert.equal(cov.threadsWithContext, 1);
});

test("isExcludedFromMailAnalysis matches SYSTEM INFOBOARD subjects", () => {
  assert.equal(
    isExcludedFromMailAnalysis({
      subject:
        "[SYSTEM INFOBOARD] [WARNUNG] Heads-Up: Alert noch offen: Presentation Server Support",
    }),
    true
  );
  assert.equal(
    isExcludedFromMailAnalysis({ subject: "[system infoboard] test" }),
    true
  );
  assert.equal(
    isExcludedFromMailAnalysis({ subject: "Kundenanfrage Angebot" }),
    false
  );
});

test("isExcludedFromMailAnalysis matches Monitoring subjects", () => {
  assert.equal(
    isExcludedFromMailAnalysis({
      subject: "[Monitoring] Host unreachable: srv-db-01",
    }),
    true
  );
  assert.equal(
    isExcludedFromMailAnalysis({ subject: "[monitoring] disk space low" }),
    true
  );
  assert.equal(
    isExcludedFromMailAnalysis({ subject: "Monitoring report weekly" }),
    false
  );
});
