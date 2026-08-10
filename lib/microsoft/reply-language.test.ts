import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectReplyAddressForm,
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

describe("detectReplyAddressForm", () => {
  it("detects per-Du from greeting and pronouns", () => {
    assert.equal(
      detectReplyAddressForm(
        "Hallo Andrej\n\nDanke für deine Infos. Kannst du mir noch die Logs schicken?\n\nGruss Rolf"
      ),
      "du"
    );
  });

  it("detects formal Sie address", () => {
    assert.equal(
      detectReplyAddressForm(
        "Sehr geehrter Herr Meier\n\nvielen Dank für Ihre Nachricht. Könnten Sie uns bitte die Logs senden?\n\nFreundliche Grüsse"
      ),
      "formal"
    );
  });

  it("weights our sent replies over customer tone", () => {
    assert.equal(
      detectReplyAddressForm(
        ["Hallo Rolf, hier die Infos von uns."],
        {
          ourTexts: [
            "Sehr geehrter Herr Keller\n\nWir melden uns, sobald Sie die Daten geliefert haben.",
          ],
        }
      ),
      "formal"
    );
  });
});
