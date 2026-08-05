import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalMerchant,
  cleanMerchantText,
  merchantLogoUrl,
  shouldAutoExcludeCreditCardLine,
} from "./merchants.ts";

test("canonicalMerchant maps acquirer-prefixed brands to one key", () => {
  const a = canonicalMerchant("GOOGLE *WORKSPACE_BUDDY");
  const b = canonicalMerchant("GOOGLE*CLOUD ZUERICH CH");
  assert.equal(a.key, "google");
  assert.equal(b.key, "google");
  assert.equal(a.label, "Google");
  assert.equal(a.domain, "google.com");
});

test("canonicalMerchant recognizes OpenAI and GitHub subscriptions", () => {
  assert.equal(canonicalMerchant("OPENAI *CHATGPT SUBSCR").key, "openai");
  assert.equal(canonicalMerchant("GITHUB.COM HTTPSGITHUB.C US").key, "github");
});

test("canonicalMerchant strips processor prefix before matching", () => {
  assert.equal(canonicalMerchant("PAYPAL *SPOTIFY").key, "spotify");
  assert.equal(canonicalMerchant("SQ *MIGROS ALTDORF CH").key, "migros");
});

test("canonicalMerchant groups unknown merchants by leading tokens", () => {
  const one = canonicalMerchant("MIGROL TANKSTELLE ALTDORF CH");
  const two = canonicalMerchant("MIGROL TANKSTELLE ERSTFELD CH");
  assert.equal(one.key, two.key);
  assert.equal(one.domain, null);
});

test("cleanMerchantText removes store numbers and country tails", () => {
  assert.equal(
    cleanMerchantText("BUCHHANDLUNG MEIER ZUERICH CH"),
    "BUCHHANDLUNG MEIER ZUERICH"
  );
  assert.equal(cleanMerchantText("KIOSK NR. 4711"), "KIOSK");
});

test("canonicalMerchant falls back to Unbekannt for empty input", () => {
  const merchant = canonicalMerchant("   ");
  assert.equal(merchant.key, "unbekannt");
  assert.equal(merchant.domain, null);
});

test("all merchants use the same AI-logo route, including unknown names", () => {
  const unknown = canonicalMerchant("Apfelcast Luzern");
  assert.match(merchantLogoUrl(unknown) || "", /\/api\/merchants\/logo\//);
});

test("settlement rows are excluded by default, purchases are not", () => {
  assert.equal(
    shouldAutoExcludeCreditCardLine("Ihre Zahlung", "Ihre Zahlung"),
    true
  );
  assert.equal(
    shouldAutoExcludeCreditCardLine("Zahlungseingang", "Zahlungseingang"),
    true
  );
  assert.equal(
    shouldAutoExcludeCreditCardLine("Zahlung Google Workspace", "Google"),
    false
  );
});
