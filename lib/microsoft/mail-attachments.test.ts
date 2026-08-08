import assert from "node:assert/strict";
import test from "node:test";
import { isPdfAttachment } from "./mail-attachments.ts";
import { microsoftAttachmentSourceId } from "@/lib/buddy/source-links.ts";
import { O365_PAPERLESS_TAGS } from "./mail-to-paperless.ts";

test("isPdfAttachment accepts pdf name and content-type", () => {
  assert.equal(
    isPdfAttachment({ name: "Rechnung.pdf", contentType: "application/octet-stream" }),
    true
  );
  assert.equal(
    isPdfAttachment({ name: "x.bin", contentType: "application/pdf" }),
    true
  );
  assert.equal(
    isPdfAttachment({ name: "foto.jpg", contentType: "image/jpeg" }),
    false
  );
});

test("microsoft attachment source id is stable", () => {
  assert.equal(
    microsoftAttachmentSourceId("msg1", "att2"),
    "msg1#att2"
  );
});

test("O365 default tags include business markers", () => {
  assert.ok(O365_PAPERLESS_TAGS.includes("O365"));
  assert.ok(O365_PAPERLESS_TAGS.includes("ANG"));
  assert.ok(O365_PAPERLESS_TAGS.includes("geschäftlich"));
});
