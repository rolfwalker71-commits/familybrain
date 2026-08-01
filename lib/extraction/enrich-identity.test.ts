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

test("enrichAnalysisIdentity appends IBAN after plain period in title", () => {
  const title =
    "Kontoauszug Raiffeisenbank Cham-Steinhausen 01.06.2026 - 30.06.2026";
  const content = `Kontoinhaber Rolf Josef Walker
IBAN CH78 8080 8002 2500 9227 7
Kontoart / Währung Mitglieder Privatkonto / CHF
Kontorubrik Steuern`;
  const enriched = enrichAnalysisIdentity(
    baseAnalysis({
      category: "Steuern",
      short_summary:
        "Kontoauszug für den Zeitraum vom 01.06.2026 bis 30.06.2026 mit verschiedenen Buchungen und einem Endsaldo von 14'620.85 CHF.",
      suggested_title: title,
      account_number: "Mitglieder Privatkonto",
    }),
    {
      title,
      content,
      correspondent: "Raiffeisenbank Cham-Steinhausen",
    }
  );
  assert.match(enriched.short_summary || "", /CH78\s*8080\s*8002/i);
  assert.match(enriched.short_summary || "", /\(CH78/);
  assert.doesNotMatch(enriched.account_number || "", /^01\.06\.2026$/);
  assert.match(enriched.account_number || "", /CH78/i);
  assert.equal(enriched.bank_name, "Raiffeisen");
  assert.equal(
    enriched.suggested_title,
    "Kontoauszug Raiffeisen 01.06.2026 - 30.06.2026 (CH78 8080 8002 2500 9227 7)"
  );
});

test("enrichAnalysisIdentity fixes glued title IBAN without CH", () => {
  const enriched = enrichAnalysisIdentity(
    baseAnalysis({
      category: "Steuern",
      short_summary: "Kontoauszug Juli 2026 mit Saldo.",
      suggested_title: "Kontoauszug Raiffeisen7880808002250092277",
      account_number: "7880808002250092277",
    }),
    {
      title: "Kontoauszug Raiffeisen7880808002250092277",
      content: "IBAN CH78 8080 8002 2500 9227 7",
      correspondent: "Raiffeisenbank Cham-Steinhausen",
    }
  );
  assert.equal(
    enriched.suggested_title,
    "Kontoauszug Raiffeisen (CH78 8080 8002 2500 9227 7)"
  );
  assert.match(enriched.short_summary || "", /\(CH78 8080 8002 2500 9227 7\)/);
});

test("enrichAnalysisIdentity appends masked card number for Kreditkartenabrechnung", () => {
  const enriched = enrichAnalysisIdentity(
    baseAnalysis({
      category: "Steuern",
      short_summary: "Kreditkartenabrechnung Visa Juni 2026.",
      suggested_title: "Kreditkartenabrechnung Visa 06.2026",
    }),
    {
      title: "Kreditkartenabrechnung Visa 06.2026",
      content:
        "Kartennummer **** **** **** 4291\nAbrechnung Juni 2026\nBetrag CHF 120.00",
      correspondent: "Visa",
    }
  );
  assert.match(enriched.short_summary || "", /••••\s*4291/);
  assert.equal(enriched.account_number, "•••• 4291");
});
