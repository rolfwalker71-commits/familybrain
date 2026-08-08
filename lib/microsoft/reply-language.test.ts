import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectReplyLanguage,
  normalizeReplySubject,
} from "./reply-language-shared.ts";

describe("detectReplyLanguage", () => {
  it("detects English business mail", () => {
    assert.equal(
      detectReplyLanguage(
        "Dear all We have successfully moved the Rinco FR Database. Please confirm."
      ),
      "en"
    );
  });

  it("detects German business mail", () => {
    assert.equal(
      detectReplyLanguage(
        "Sehr geehrte Frau Middi, vielen Dank für Ihre Nachricht. Mit freundlichen Grüssen"
      ),
      "de"
    );
  });
});

describe("normalizeReplySubject", () => {
  it("uses Re: for English and AW: for German", () => {
    assert.equal(
      normalizeReplySubject("AW: RINCO FR -> Move to new Server", "en"),
      "Re: RINCO FR -> Move to new Server"
    );
    assert.equal(
      normalizeReplySubject("Re: Angebot prüfen", "de"),
      "AW: Angebot prüfen"
    );
  });
});
