import assert from "node:assert/strict";
import test from "node:test";
import {
  extractIban,
  extractLocalAccountNumber,
  extractCardNumber,
  resolveAccountNumber,
  looksLikeDateToken,
} from "./bank.ts";

test("extractLocalAccountNumber ignores statement period dates", () => {
  const title =
    "Kontoauszug Raiffeisenbank Cham-Steinhausen 01.06.2026 - 30.06.2026";
  assert.equal(extractLocalAccountNumber(title), null);
  assert.equal(looksLikeDateToken("01.06.2026"), true);
});

test("resolveAccountNumber falls back to IBAN when only IBAN is present", () => {
  const title =
    "Kontoauszug Raiffeisenbank Cham-Steinhausen 01.06.2026 - 30.06.2026";
  const content = `IBAN CH78 8080 B002 2500 9227 7
Kontorubrik Steuern`;
  const resolved = resolveAccountNumber({
    title,
    content,
    shortSummary: "Kontoauszug Juni 2026.",
  });
  assert.match(resolved || "", /CH78/);
  assert.equal(extractIban(content)?.includes("CH78"), true);
});

test("resolveAccountNumber prefers Kontonummer over IBAN", () => {
  const content = `Kontonummer 0020-16608-4A
IBAN CH93 0076 2011 6238 5295 7`;
  assert.equal(
    resolveAccountNumber({ content }),
    "0020-16608-4A"
  );
});

test("extractCardNumber finds masked card", () => {
  assert.equal(
    extractCardNumber("Kartennummer **** **** **** 4291"),
    "•••• 4291"
  );
});
