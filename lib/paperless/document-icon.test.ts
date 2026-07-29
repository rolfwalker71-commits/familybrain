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
  assert.match(prompt, /white background/i);
  assert.match(prompt, /colorful/i);
  assert.match(prompt, /no text/i);
  assert.doesNotMatch(prompt, /sage/i);
});
