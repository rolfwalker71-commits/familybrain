import assert from "node:assert/strict";
import test from "node:test";
import {
  clusterDocumentsByTitleAndDate,
  documentDateKey,
  extractDocumentRefNumber,
  normalizeDuplicateDescription,
} from "@/lib/documents/duplicates";

test("normalizeDuplicateDescription folds case and whitespace", () => {
  assert.equal(
    normalizeDuplicateDescription("  Rechnung  Swisscom  März  "),
    "rechnung swisscom marz"
  );
  assert.equal(normalizeDuplicateDescription(null), "");
});

test("documentDateKey extracts calendar day", () => {
  assert.equal(documentDateKey("2025-03-15T10:00:00"), "2025-03-15");
  assert.equal(documentDateKey("2025-03-15"), "2025-03-15");
  assert.equal(documentDateKey(null), "");
});

test("extractDocumentRefNumber reads Nr. from title", () => {
  assert.equal(
    extractDocumentRefNumber("Prämienrechnung Nr. 615284766"),
    "615284766"
  );
  assert.notEqual(
    extractDocumentRefNumber("Prämienrechnung Nr. 615284766"),
    extractDocumentRefNumber("Prämienrechnung Nr. 612774842")
  );
});

const SUMMARY = "Zins- und Kapitalausweis für Rolf Walker von CREDIT SUISSE.";

function row(
  id: number,
  title: string,
  created_date: string
): Parameters<typeof clusterDocumentsByTitleAndDate>[0][number] {
  return {
    id,
    paperless_id: id,
    title,
    correspondent_name: "CREDIT SUISSE",
    created_date,
    content_hash: null,
    paperless_url: null,
    ai_icon_path: null,
    short_summary: SUMMARY,
    category: "Finanzen",
    analysis_status: "completed",
  };
}

test("Credit Suisse: same summary but different titles/years are not one cluster", () => {
  const clusters = clusterDocumentsByTitleAndDate([
    row(790, "Zins- und Kapitalausweis 2023", "2024-01-15"),
    row(789, "Zins- und Kapitalausweis 0020-16608-4A", "2024-01-15"),
    row(432, "Zins- und Kapitalausweis 2022", "2023-01-16"),
    row(431, "Zins- und Kapitalausweis 2022", "2023-01-16"),
    row(430, "Zins- und Kapitalausweis für Rolf Walker", "2023-01-16"),
    row(281, "Zins- und Kapitalausweis für Rolf Walker", "2022-01-17"),
    row(280, "Zins- und Kapitalausweis für Rolf Walker", "2022-01-17"),
    row(279, "Zins- und Kapitalausweis für Rolf Walker", "2022-01-17"),
  ]);

  // Only title+date matches: 2022×2 on 2023-01-16, and für Rolf Walker×3 on 2022-01-17
  assert.equal(clusters.length, 2);

  const pair = clusters.find((c) => c.count === 2);
  const triple = clusters.find((c) => c.count === 3);
  assert.ok(pair, "expected 2 identical title+date");
  assert.ok(triple, "expected 3 identical title+date");
  assert.deepEqual(
    pair!.documents.map((d) => d.id).sort((a, b) => a - b),
    [431, 432]
  );
  assert.deepEqual(
    triple!.documents.map((d) => d.id).sort((a, b) => a - b),
    [279, 280, 281]
  );
});

test("same title different date is not a duplicate", () => {
  const clusters = clusterDocumentsByTitleAndDate([
    row(1, "Zins- und Kapitalausweis für Rolf Walker", "2022-01-17"),
    row(2, "Zins- und Kapitalausweis für Rolf Walker", "2023-01-16"),
  ]);
  assert.equal(clusters.length, 0);
});

test("Concordia different Nr. in title are not duplicates even same date", () => {
  const clusters = clusterDocumentsByTitleAndDate([
    {
      ...row(1, "Prämienrechnung Nr. 615284766", "2026-09-01"),
      short_summary: "Prämienrechnung für Rolf Walker von CONCORDIA.",
    },
    {
      ...row(2, "Prämienrechnung Nr. 612774842", "2026-09-01"),
      short_summary: "Prämienrechnung für Rolf Walker von CONCORDIA.",
    },
  ]);
  assert.equal(clusters.length, 0);
});
