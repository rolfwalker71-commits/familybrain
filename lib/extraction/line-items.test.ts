import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureGesamtbetragAmount,
  normalizeLineItem,
  resolveInvoiceTotal,
} from "./line-items.ts";
import type { DocumentAnalysis } from "@/lib/ai/schemas";

test("normalizeLineItem splits embedded 7x prefix into quantity", () => {
  const item = normalizeLineItem({
    description: "7x · tesa Insektenschutz COMFORT",
    amount: 98.7,
    currency: "CHF",
  });
  assert.equal(item.quantity, 7);
  assert.equal(item.description, "tesa Insektenschutz COMFORT");
});

test("normalizeLineItem keeps explicit quantity", () => {
  const item = normalizeLineItem({
    description: "Insektenschutz",
    quantity: 2,
    amount: 10,
    currency: "CHF",
  });
  assert.equal(item.quantity, 2);
  assert.equal(item.description, "Insektenschutz");
});

test("resolveInvoiceTotal prefers Gesamtbetrag label", () => {
  const total = resolveInvoiceTotal({
    amounts: [
      { amount: 23.7, currency: "CHF", label: "Zwischensumme" },
      { amount: 122.4, currency: "CHF", label: "Gesamtbetrag" },
    ],
    financialItems: [{ amount: 999, currency: "CHF" }],
  });
  assert.deepEqual(total, { amount: 122.4, currency: "CHF" });
});

test("ensureGesamtbetragAmount adds from financial_items", () => {
  const analysis = {
    amounts: [],
    financial_items: [
      {
        vendor: "X",
        amount: 50,
        currency: "CHF",
        invoice_date: null,
        due_date: null,
        category: null,
        is_recurring: false,
      },
    ],
  } as DocumentAnalysis;
  const amounts = ensureGesamtbetragAmount(analysis);
  assert.equal(amounts.length, 1);
  assert.equal(amounts[0]?.label, "Gesamtbetrag");
  assert.equal(amounts[0]?.amount, 50);
});
