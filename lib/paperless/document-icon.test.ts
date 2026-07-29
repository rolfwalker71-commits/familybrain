import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentAiIconPrompt } from "./document-icon.ts";

test("buildDocumentAiIconPrompt includes category, white bg, colorful, no text", () => {
  const prompt = buildDocumentAiIconPrompt({
    title: "Swisscom Rechnung März",
    category: "Finanzen",
    correspondent: "Swisscom",
    vendor: "Swisscom",
    shortSummary: "Monatsrechnung Mobilfunk",
  });
  assert.match(prompt, /Finanzen/);
  assert.match(prompt, /Swisscom Rechnung/);
  assert.match(prompt, /organization\/brand «Swisscom»/);
  assert.match(prompt, /primary logo cue/i);
  assert.match(prompt, /white background/i);
  assert.match(prompt, /colorful/i);
  assert.match(prompt, /no text/i);
  assert.match(prompt, /official logo/i);
  assert.doesNotMatch(prompt, /no logos/i);
  assert.doesNotMatch(prompt, /sage/i);
});

test("buildDocumentAiIconPrompt uses correspondent when title has no firm name", () => {
  const prompt = buildDocumentAiIconPrompt({
    title: "Rechnung Nr. 12345",
    category: "Finanzen",
    correspondent: "Migros Bank AG",
    documentType: "Rechnung",
  });
  assert.match(prompt, /organization\/brand «Migros Bank AG»/);
  assert.match(prompt, /Migros Bank AG/);
  assert.match(prompt, /official logo/i);
});
