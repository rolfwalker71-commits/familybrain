import assert from "node:assert/strict";
import test from "node:test";
import { matchDocumentBrandLogo } from "@/lib/paperless/brand-logos";

test("matches Uri only as Absender/Provider alias", () => {
  assert.equal(
    matchDocumentBrandLogo({ correspondent: "Kanton Uri" })?.id,
    "uri"
  );
  assert.equal(matchDocumentBrandLogo({ vendor: "Uri" })?.id, "uri");
  assert.equal(
    matchDocumentBrandLogo({ correspondent: "Steuerverwaltung Uri" }),
    null
  );
  assert.equal(
    matchDocumentBrandLogo({ correspondent: "Justizdirektion Kanton Uri" }),
    null
  );
});

test("matches Altdorf aliases", () => {
  assert.equal(
    matchDocumentBrandLogo({ correspondent: "Altdorf" })?.id,
    "altdorf"
  );
  assert.equal(
    matchDocumentBrandLogo({ correspondent: "Altdorf UR" })?.id,
    "altdorf"
  );
  assert.equal(
    matchDocumentBrandLogo({
      correspondent: "Einwohnergemeinde Altdorf UR",
    }),
    null
  );
});

test("matches ANG aliases", () => {
  assert.equal(matchDocumentBrandLogo({ correspondent: "ANG" })?.id, "ang");
  assert.equal(
    matchDocumentBrandLogo({ correspondent: "ANG Schweiz" })?.id,
    "ang"
  );
  assert.equal(
    matchDocumentBrandLogo({ correspondent: "ANG International" }),
    null
  );
  assert.equal(
    matchDocumentBrandLogo({ vendor: "AN-Group" }),
    null
  );
});

test("ignores title/OCR-style noise — only provider fields", () => {
  assert.equal(matchDocumentBrandLogo({}), null);
  assert.equal(
    matchDocumentBrandLogo({ correspondent: null, vendor: "  ang schweiz " })
      ?.id,
    "ang"
  );
});
