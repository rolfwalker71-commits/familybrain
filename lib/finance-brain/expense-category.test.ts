import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseVisualFromText } from "./expense-category";

describe("expenseVisualFromText", () => {
  it("detects restaurant text", () => {
    const v = expenseVisualFromText("Abendessen Restaurant Miami");
    assert.equal(v.label, "Essen");
    assert.equal(v.tone, "orange");
  });

  it("detects hotel text", () => {
    const v = expenseVisualFromText("Marriott Hotel Buchung");
    assert.equal(v.label, "Hotel");
    assert.equal(v.tone, "indigo");
  });

  it("falls back to banknote for unknown text", () => {
    const v = expenseVisualFromText("TEST EUR");
    assert.equal(v.label, "Ausgabe");
    assert.equal(v.tone, "green");
  });

  it("falls back for empty description", () => {
    const v = expenseVisualFromText(null);
    assert.equal(v.label, "Ausgabe");
  });
});
