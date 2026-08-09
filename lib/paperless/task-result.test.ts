import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPaperlessTaskDocumentId,
  paperlessTaskFailureMessage,
} from "@/lib/paperless/task-result";

test("extractPaperlessTaskDocumentId reads v9 related_document", () => {
  assert.equal(
    extractPaperlessTaskDocumentId({ related_document: "416" }),
    416
  );
});

test("extractPaperlessTaskDocumentId reads v10 related_document_ids + result_data", () => {
  assert.equal(
    extractPaperlessTaskDocumentId({
      status: "success",
      related_document_ids: [16],
      result_data: { document_id: 16 },
      result_message: "Success. New document id 16 created",
    }),
    16
  );
});

test("extractPaperlessTaskDocumentId reads duplicate_of as success id", () => {
  assert.equal(
    extractPaperlessTaskDocumentId({
      status: "failure",
      related_document: null,
      result_data: { duplicate_of: 1884 },
      result_message: "Not consuming: It is a duplicate of document #1884",
    }),
    1884
  );
});

test("extractPaperlessTaskDocumentId parses legacy result strings", () => {
  assert.equal(
    extractPaperlessTaskDocumentId({
      result: "Success. New document id 99 created",
    }),
    99
  );
  assert.equal(
    extractPaperlessTaskDocumentId({
      result: "file.pdf: Not consuming: It is a duplicate of test (#42).",
    }),
    42
  );
});

test("paperlessTaskFailureMessage prefers structured error", () => {
  assert.equal(
    paperlessTaskFailureMessage({
      result_data: { error_message: "Corrupt PDF" },
      result: "ignored",
    }),
    "Corrupt PDF"
  );
});
