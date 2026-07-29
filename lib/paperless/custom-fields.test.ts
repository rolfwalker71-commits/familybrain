import assert from "node:assert/strict";
import test from "node:test";
import {
  BUDDY_CUSTOM_FIELD_NAMES,
  buddyCategoryTag,
  buddyLedgerTag,
  buddyTripTag,
  coerceCustomFieldValue,
  extractNamedBooleanField,
  extractNamedStringField,
  findCustomFieldId,
  normalizeFieldName,
  slugifyBuddyTagPart,
} from "./custom-fields.ts";
import { extractPaperlessWebhookDocumentId } from "./webhook-parse.ts";

test("normalizeFieldName collapses whitespace and case", () => {
  assert.equal(normalizeFieldName("  Buddy  geprüft "), "buddy geprüft");
  assert.equal(normalizeFieldName("Steuer\u00a0relevant"), "steuer relevant");
});

test("findCustomFieldId matches exact German names", () => {
  const defs = [
    { id: 1, name: "Betrag" },
    { id: 2, name: "Buddy geprüft" },
    { id: 3, name: "Zu bezahlen" },
  ];
  assert.equal(findCustomFieldId(defs, BUDDY_CUSTOM_FIELD_NAMES.amount), 1);
  assert.equal(
    findCustomFieldId(defs, BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed),
    2
  );
  assert.equal(findCustomFieldId(defs, "fehlt"), null);
});

test("coerceCustomFieldValue by Paperless data_type", () => {
  assert.equal(coerceCustomFieldValue("boolean", "1"), true);
  assert.equal(coerceCustomFieldValue("boolean", 0), false);
  assert.equal(coerceCustomFieldValue("float", "12.5"), 12.5);
  assert.equal(coerceCustomFieldValue("monetary", "99"), 99);
  assert.equal(coerceCustomFieldValue("date", "2026-07-29T12:00:00"), "2026-07-29");
  assert.equal(coerceCustomFieldValue("date", "bad"), null);
  assert.equal(coerceCustomFieldValue("string", 42), "42");
});

test("slugifyBuddyTagPart and buddy tags", () => {
  assert.equal(slugifyBuddyTagPart("Geräte & Garantien"), "geraete-und-garantien");
  assert.equal(buddyCategoryTag("Finanzen"), "buddy:kat:finanzen");
  assert.equal(buddyTripTag(7, "Mallorca 2026"), "buddy:trip:7-mallorca-2026");
  assert.equal(buddyTripTag(7, null), "buddy:trip:7");
  assert.equal(
    buddyLedgerTag(3, "Haushaltsbudget"),
    "buddy:ledger:3-haushaltsbudget"
  );
});

test("extractNamedBoolean/StringField from custom_fields", () => {
  const doc = {
    custom_fields: [
      { field: 10, name: "Buddy geprüft", value: true },
      { field: 11, name: "Steuer relevant", value: false },
      { field: 12, name: "Buddy Status", value: "offen" },
    ],
  };
  const map = new Map<number, string>();
  assert.equal(
    extractNamedBooleanField(doc, map, BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed),
    true
  );
  assert.equal(
    extractNamedBooleanField(doc, map, BUDDY_CUSTOM_FIELD_NAMES.taxRelevant),
    false
  );
  assert.equal(
    extractNamedStringField(doc, map, BUDDY_CUSTOM_FIELD_NAMES.buddyStatus),
    "offen"
  );
});

test("extractNamed* resolves via field id map when name missing", () => {
  const doc = {
    custom_fields: [{ field: 99, value: true }],
  };
  const map = new Map([[99, "Buddy geprüft"]]);
  assert.equal(
    extractNamedBooleanField(doc, map, BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed),
    true
  );
});

test("extractPaperlessWebhookDocumentId parses common shapes", () => {
  assert.equal(extractPaperlessWebhookDocumentId(42), 42);
  assert.equal(extractPaperlessWebhookDocumentId("99"), 99);
  assert.equal(extractPaperlessWebhookDocumentId({ id: 5 }), 5);
  assert.equal(extractPaperlessWebhookDocumentId({ document_id: 8 }), 8);
  assert.equal(
    extractPaperlessWebhookDocumentId({ document: { id: 12 } }),
    12
  );
  assert.equal(extractPaperlessWebhookDocumentId({ data: { id: 3 } }), 3);
  assert.equal(extractPaperlessWebhookDocumentId({}), null);
  assert.equal(extractPaperlessWebhookDocumentId(null), null);
  assert.equal(
    extractPaperlessWebhookDocumentId({
      doc_url: "https://paperless.example/documents/1126/details",
    }),
    1126
  );
  assert.equal(
    extractPaperlessWebhookDocumentId(
      "http://192.168.5.1/documents/77/"
    ),
    77
  );
});
