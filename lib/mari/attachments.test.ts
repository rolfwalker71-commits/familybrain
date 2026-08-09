import assert from "node:assert/strict";
import test from "node:test";
import { isImageAttachmentRow } from "@/lib/mari/attachments";

test("detects image attachments by mime and filename", () => {
  assert.equal(
    isImageAttachmentRow({ MimeType: "png", OrgFilename: "x.bin" }),
    true
  );
  assert.equal(
    isImageAttachmentRow({ MimeType: "application/pdf", OrgFilename: "a.pdf" }),
    false
  );
  assert.equal(
    isImageAttachmentRow({ MimeType: "", OrgFilename: "shot.JPEG" }),
    true
  );
});
