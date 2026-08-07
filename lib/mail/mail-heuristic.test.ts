import assert from "node:assert/strict";
import test from "node:test";
import {
  chipForStatus,
  chipLabelDe,
  shouldAnalyzeMail,
} from "@/lib/mail/mail-heuristic";

test("UPS-like mail should be analyzed", () => {
  assert.equal(
    shouldAnalyzeMail({
      from: "mcinfo@ups.com",
      fromName: "UPS",
      subject: "UPS Abholung / Zustellung",
      snippet: "Ihre Sendung wird zugestellt",
    }),
    true
  );
});

test("newsletter should skip", () => {
  assert.equal(
    shouldAnalyzeMail({
      from: "news@shop.ch",
      fromName: "Shop",
      subject: "Newsletter: Sale %",
      snippet: "Unsubscribe hier",
    }),
    false
  );
});

test("chip labels", () => {
  assert.equal(chipLabelDe(chipForStatus("pending_triage", 2)), "Vorschlag");
  assert.equal(chipLabelDe(chipForStatus("analyzed", 0)), "Analysiert");
  assert.equal(chipForStatus("skipped", 0), null);
});
