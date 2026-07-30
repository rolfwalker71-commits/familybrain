import assert from "node:assert/strict";
import test from "node:test";
import {
  looksLikeLohnausweis,
  resolveAlsoCategories,
  resolveTaxYear,
} from "@/lib/extraction/tax";
import type { DocumentAnalysis } from "@/lib/ai/schemas";

function base(overrides: Partial<DocumentAnalysis> = {}): DocumentAnalysis {
  return {
    category: "Steuern",
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
    confidence: 0.9,
    also_categories: [],
    ...overrides,
  };
}

test("resolveTaxYear prefers AI then title year", () => {
  assert.equal(resolveTaxYear({ taxYear: 2024, title: "x 2025" }), 2024);
  assert.equal(
    resolveTaxYear({
      title: "Lohnausweis 2025 Rolf Walker",
      createdDate: "2026-03-01",
    }),
    2025
  );
  assert.equal(
    resolveTaxYear({
      title: "Scan",
      createdDate: "2023-06-15",
    }),
    2023
  );
});

test("Lohnausweis also_categories includes Arbeit", () => {
  assert.ok(looksLikeLohnausweis("Lohnausweis 2025"));
  const cats = resolveAlsoCategories({
    analysis: base({ also_in_arbeit: true }),
    title: "Lohnausweis 2025",
    category: "Steuern",
  });
  assert.deepEqual(cats, ["Arbeit"]);
});
