import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrandMatchHaystack,
  matchDocumentBrandLogo,
} from "@/lib/paperless/brand-logos";

test("matches Kanton Uri and URI without URL false positives", () => {
  assert.equal(
    matchDocumentBrandLogo(
      buildBrandMatchHaystack({
        title: "Steuerrechnung Kanton Uri",
        correspondent: "Steuerverwaltung Uri",
      })
    )?.id,
    "uri"
  );
  assert.equal(
    matchDocumentBrandLogo(
      buildBrandMatchHaystack({
        content: "Bescheid der Behörde URI für Rolf Walker",
      })
    )?.id,
    "uri"
  );
  assert.equal(
    matchDocumentBrandLogo(
      buildBrandMatchHaystack({
        content: "Siehe https://example.com/uri/path und sonst nichts",
      })
    ),
    null
  );
});

test("matches ANG / AN-Group", () => {
  assert.equal(
    matchDocumentBrandLogo(
      buildBrandMatchHaystack({
        correspondent: "ANG International",
        title: "Offerte SAP",
      })
    )?.id,
    "ang"
  );
  assert.equal(
    matchDocumentBrandLogo(
      buildBrandMatchHaystack({
        letterhead: "AN-Group · an-group.one",
      })
    )?.id,
    "ang"
  );
});
