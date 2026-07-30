import assert from "node:assert/strict";
import test from "node:test";
import { parseEmailList } from "@/lib/mail/triage-mail-settings";
import { buildTriageReadyMail } from "@/lib/mail/triage-ready-template";

test("parseEmailList splits and dedupes", () => {
  assert.deepEqual(parseEmailList("a@b.ch, A@b.ch; c@d.ch"), [
    "a@b.ch",
    "c@d.ch",
  ]);
  assert.deepEqual(parseEmailList("  "), []);
  assert.deepEqual(parseEmailList("not-an-email"), []);
});

test("buildTriageReadyMail has no pdf wording as attachment promise", () => {
  const mail = buildTriageReadyMail({
    items: [
      {
        title: "Test Rechnung",
        amountLabel: "CHF 10.00",
        reasons: ["invoice"],
      },
    ],
    inboxUrl: "https://example.com/dashboard",
    totalPending: 1,
  });
  assert.match(mail.subject, /Dokument/);
  assert.match(mail.html, /Zur Inbox öffnen/);
  assert.doesNotMatch(mail.html, /PDF im Anhang/i);
  assert.match(mail.text, /Kein PDF-Anhang/);
});
