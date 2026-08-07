import assert from "node:assert/strict";
import test from "node:test";
import { appendMailSubjectToNotes } from "@/lib/mail/subject-notes";

test("append subject as (Betreff)", () => {
  assert.equal(
    appendMailSubjectToNotes(null, "UPS Shipment"),
    "(UPS Shipment)"
  );
  assert.equal(
    appendMailSubjectToNotes("Zustellung 9–13", "UPS Shipment"),
    "Zustellung 9–13\n(UPS Shipment)"
  );
});

test("append is idempotent", () => {
  const once = appendMailSubjectToNotes("x", "Betreff");
  assert.equal(appendMailSubjectToNotes(once, "Betreff"), once);
});

test("skip empty / placeholder subject", () => {
  assert.equal(appendMailSubjectToNotes("nur notes", "(kein Betreff)"), "nur notes");
  assert.equal(appendMailSubjectToNotes(null, "  "), null);
});
