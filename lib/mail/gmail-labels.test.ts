import assert from "node:assert/strict";
import test from "node:test";
import { GMAIL_STATUS_LABELS } from "@/lib/mail/gmail-labels";
import type { MailAnalysisStatus } from "@/lib/mail/mail-heuristic";

test("every analysis status has a BUDDY - Gmail label", () => {
  const statuses: MailAnalysisStatus[] = [
    "pending_triage",
    "analyzed",
    "skipped",
    "error",
    "applied",
    "dismissed",
  ];
  for (const s of statuses) {
    assert.match(GMAIL_STATUS_LABELS[s], /^BUDDY - /);
  }
  assert.equal(GMAIL_STATUS_LABELS.pending_triage, "BUDDY - Zur Triage");
  assert.equal(GMAIL_STATUS_LABELS.analyzed, "BUDDY - Kein Extrakt");
  assert.equal(GMAIL_STATUS_LABELS.skipped, "BUDDY - Übersprungen");
});
