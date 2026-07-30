import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentAiIconPrompt,
  clipDocumentLetterhead,
} from "./document-icon.ts";

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
  assert.match(prompt, /invent a clean logo-like emblem/i);
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

test("buildDocumentAiIconPrompt uses document preview cues as logo fallback", () => {
  const prompt = buildDocumentAiIconPrompt({
    title: "Offerte 2026",
    category: "Finanzen",
    correspondent: "Obscure GmbH",
    letterhead: "Obscure GmbH · Zürich · Handwerk",
    brandCues: {
      knownLogoVisible: false,
      brandNameGuess: "Obscure",
      colors: ["forest green", "cream"],
      logoDescription: "stylized pine tree in a circle",
      styleNotes: "earthy outdoor brand",
    },
  });
  assert.match(prompt, /visual identity from document preview/i);
  assert.match(prompt, /forest green/);
  assert.match(prompt, /pine tree/i);
  assert.match(prompt, /letterhead cues/i);
  assert.match(prompt, /invent a clean logo-like emblem/i);
  assert.doesNotMatch(prompt, /generic subject-matched icon/);
});

test("clipDocumentLetterhead keeps early OCR lines", () => {
  const clipped = clipDocumentLetterhead("Acme AG\nRechnung\n\nPos 1\nPos 2", 80);
  assert.match(clipped, /Acme AG/);
  assert.match(clipped, /Rechnung/);
});
