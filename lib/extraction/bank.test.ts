import assert from "node:assert/strict";
import test from "node:test";
import {
  extractIban,
  extractLocalAccountNumber,
  extractCardNumber,
  resolveAccountNumber,
  looksLikeDateToken,
  shortenInstitutionName,
  recoverIbanDisplay,
  ensureAccountInParens,
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

test("resolveAccountNumber ignores AI prose and uses IBAN from OCR", () => {
  const resolved = resolveAccountNumber({
    accountNumber: "Mitglieder Privatkonto",
    title: "Kontoauszug Raiffeisenbank Cham-Steinhausen 01.06.2026 - 30.06.2026",
    shortSummary:
      "Kontoauszug für den Zeitraum vom 01.06.2026 bis 30.06.2026 mit verschiedenen Buchungen und einem Endsaldo von 14'620.85 CHF.",
    content: `Kontoinhaber Rolf Josef Walker
IBAN CH78 8080 8002 2500 9227 7
Kontoart / Währung Mitglieder Privatkonto / CHF`,
  });
  assert.match(resolved || "", /CH78\s*8080\s*8002/);
});

test("shortenInstitutionName collapses Raiffeisen branch names", () => {
  assert.equal(
    shortenInstitutionName(
      "Kontoauszug Raiffeisenbank Cham-Steinhausen Juni 2026"
    ),
    "Kontoauszug Raiffeisen Juni 2026"
  );
});

test("recoverIbanDisplay adds missing CH prefix", () => {
  assert.equal(
    recoverIbanDisplay("7880808002250092277"),
    "CH78 8080 8002 2500 9227 7"
  );
  assert.equal(
    recoverIbanDisplay("CH78 8080 8002 2500 9227 7"),
    "CH78 8080 8002 2500 9227 7"
  );
});

test("ensureAccountInParens fixes glued IBAN in title", () => {
  assert.equal(
    ensureAccountInParens(
      "Kontoauszug Raiffeisen7880808002250092277",
      "7880808002250092277"
    ),
    "Kontoauszug Raiffeisen (CH78 8080 8002 2500 9227 7)"
  );
});

test("ensureAccountInParens keeps period plain and appends IBAN", () => {
  assert.equal(
    ensureAccountInParens(
      "Kontoauszug Raiffeisen 01.07.2026 - 31.07.2026",
      "CH78 8080 8002 2500 9227 7"
    ),
    "Kontoauszug Raiffeisen 01.07.2026 - 31.07.2026 (CH78 8080 8002 2500 9227 7)"
  );
});

test("ensureAccountInParens does not treat date-range parens as account", () => {
  // defensive: if a title ever has a period in parens, keep it and still add IBAN
  assert.equal(
    ensureAccountInParens(
      "Kontoauszug Raiffeisen (01.07.2026 - 31.07.2026)",
      "CH78 8080 8002 2500 9227 7"
    ),
    "Kontoauszug Raiffeisen (01.07.2026 - 31.07.2026) (CH78 8080 8002 2500 9227 7)"
  );
});

test("resolveAccountNumber recovers AI IBAN without CH", () => {
  assert.equal(
    resolveAccountNumber({ accountNumber: "7880808002250092277" }),
    "CH78 8080 8002 2500 9227 7"
  );
});
