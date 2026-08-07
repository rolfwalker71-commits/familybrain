import assert from "node:assert/strict";
import test from "node:test";

// Pure helpers mirrored for unit coverage without DB — import module after mock is heavy;
// here we only assert amount/vendor helpers via public match when DB empty returns null.

test("matchOpenInvoiceFromMail returns null without vendor/amount", async () => {
  const { matchOpenInvoiceFromMail } = await import("./match-finance.ts");
  assert.equal(matchOpenInvoiceFromMail({}), null);
  assert.equal(matchOpenInvoiceFromMail({ vendor: null, amount: null }), null);
});
