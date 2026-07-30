import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentAnalysis } from "@/lib/ai/schemas";
import {
  enrichAnalysisIdentity,
  resolveDocumentReference,
} from "@/lib/extraction/enrich-identity";

function baseAnalysis(
  overrides: Partial<DocumentAnalysis> = {}
): DocumentAnalysis {
  return {
    category: "Versicherungen",
    short_summary: "Prämienrechnung für Rolf Walker von CONCORDIA.",
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
    ...overrides,
  };
}

test("resolveDocumentReference prefers document_reference field", () => {
  assert.equal(
    resolveDocumentReference(
      baseAnalysis({ document_reference: "615284766" }),
      "Prämienrechnung Nr. 999"
    ),
    "615284766"
  );
});

test("enrichAnalysisIdentity appends Nr. and date when missing", () => {
  const enriched = enrichAnalysisIdentity(
    baseAnalysis({
      financial_items: [
        {
          vendor: "CONCORDIA",
          amount: 100,
          currency: "CHF",
          invoice_date: "2026-09-01",
          invoice_number: "615284766",
          due_date: null,
          category: null,
          is_recurring: true,
        },
      ],
    }),
    { title: "Prämienrechnung Nr. 615284766", createdDate: "2026-09-01" }
  );
  assert.match(enriched.short_summary || "", /615284766/);
  assert.match(enriched.short_summary || "", /01\.09\.2026/);
  assert.equal(enriched.document_reference, "615284766");
});

test("enrichAnalysisIdentity does not duplicate Nr.", () => {
  const enriched = enrichAnalysisIdentity(
    baseAnalysis({
      short_summary: "Prämienrechnung Nr. 615284766 von CONCORDIA.",
      document_reference: "615284766",
    })
  );
  assert.equal(
    (enriched.short_summary || "").match(/615284766/g)?.length,
    1
  );
});
