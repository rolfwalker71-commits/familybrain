import assert from "node:assert/strict";
import test from "node:test";
import {
  MariTicketAnalysisSchema,
  normalizeMariTicketAnalysisInput,
} from "@/lib/mari/analyze-ticket";

test("normalizes string score and loose recommendedStatus", () => {
  const n = normalizeMariTicketAnalysisInput({
    summary: "Fall X",
    completeness: { score: "75", missing: null, notes: 123 },
    suggestedTasks: [{ title: "Nachfassen", reason: null }],
    suggestions: "nur string",
    recommendedStatus: "Warte auf Kunden",
    nextReplyDraft: "",
  });
  const r = MariTicketAnalysisSchema.safeParse(n);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.completeness.score, 75);
  assert.deepEqual(r.data.completeness.missing, []);
  assert.equal(r.data.recommendedStatus?.label, "Warte auf Kunden");
  assert.equal(r.data.nextReplyDraft, null);
});

test("clips overlong summary and clamps score", () => {
  const n = normalizeMariTicketAnalysisInput({
    summary: "x".repeat(2000),
    completeness: { score: 101, missing: [] },
    suggestedTasks: [],
    suggestions: [],
  });
  const r = MariTicketAnalysisSchema.safeParse(n);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.ok(r.data.summary.length <= 800);
  assert.equal(r.data.completeness.score, 100);
});
