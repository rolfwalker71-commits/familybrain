import assert from "node:assert/strict";
import test from "node:test";
import {
  detectTriageReasons,
  HIGH_AMOUNT_CHF,
} from "./triage.ts";
import type { DocumentAnalysis } from "@/lib/ai/schemas";

function baseAnalysis(
  overrides: Partial<DocumentAnalysis> = {}
): DocumentAnalysis {
  return {
    category: "Sonstiges",
    short_summary: null,
    detailed_summary: null,
    important_points: [],
    important_dates: [],
    amounts: [],
    deadlines: [],
    contract_parties: [],
    warranty_info: null,
    cancellation_terms: null,
    possible_todos: [],
    financial_items: [],
    line_items: [],
    travel_items: [],
    confidence: 0.8,
    ...overrides,
  };
}

test("detectTriageReasons flags invoice with amount + finance category", () => {
  const reasons = detectTriageReasons(
    baseAnalysis({
      category: "Finanzen",
      financial_items: [
        {
          vendor: "Swisscom",
          amount: 49.9,
          currency: "CHF",
          invoice_date: "2026-07-01",
          due_date: "2026-07-20",
          category: "Kommunikation",
          is_recurring: true,
          description: null,
        },
      ],
    })
  );
  assert.ok(reasons.includes("invoice"));
});

test("detectTriageReasons flags high amount", () => {
  const reasons = detectTriageReasons(
    baseAnalysis({
      category: "Finanzen",
      amounts: [{ amount: HIGH_AMOUNT_CHF, currency: "CHF", label: "Total" }],
    })
  );
  assert.ok(reasons.includes("invoice"));
  assert.ok(reasons.includes("high_amount"));
});

test("detectTriageReasons flags warranty, deadline, travel", () => {
  const reasons = detectTriageReasons(
    baseAnalysis({
      warranty_info: {
        has_warranty: true,
        product_name: "iPhone",
        vendor: "Apple",
        purchase_date: null,
        warranty_until: "2027-01-01",
        serial_number: null,
      },
      deadlines: [
        {
          title: "Kündigung",
          date: "2026-09-01",
          type: "Kündigung",
          description: null,
        },
      ],
      travel_items: [
        {
          travel_type: "Flug",
          provider: "Swiss",
          title: "ZRH-BCN",
          start_date: "2026-08-01",
          end_date: "2026-08-01",
          origin: "ZRH",
          destination: "BCN",
          booking_reference: "ABC",
          price: 200,
          currency: "CHF",
          itinerary: [],
        },
      ],
    })
  );
  assert.deepEqual(reasons.sort(), ["deadline", "travel", "warranty"]);
});

test("detectTriageReasons empty for plain doc without signals", () => {
  const reasons = detectTriageReasons(
    baseAnalysis({
      category: "Sonstiges",
      short_summary: "Informationsschreiben",
    })
  );
  assert.deepEqual(reasons, []);
});
