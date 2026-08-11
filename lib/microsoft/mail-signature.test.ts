import assert from "node:assert/strict";
import test from "node:test";
import { appendMailSignature } from "./mail-signature.ts";

test("appendMailSignature Text appends with blank line", () => {
  assert.equal(
    appendMailSignature("Hallo", "Gruss\nRolf", "Text"),
    "Hallo\n\nGruss\nRolf"
  );
});

test("appendMailSignature HTML escapes plain sig", () => {
  const out = appendMailSignature("Hi", "A < B\nC", "HTML");
  assert.ok(out.includes("A &lt; B"));
  assert.ok(out.includes("<br/>"));
});

test("appendMailSignature skips empty", () => {
  assert.equal(appendMailSignature("Body", "  ", "Text"), "Body");
});
