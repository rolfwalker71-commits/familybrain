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

test("normalizes solutionSketch and keeps schema valid", () => {
  const n = normalizeMariTicketAnalysisInput({
    summary: "Open issue",
    completeness: { score: 50, missing: [] },
    suggestedTasks: [],
    suggestions: [],
    solutionSketch: {
      problemStillOpen: "true",
      outline: "In SAP Business One unter Administration prüfen…",
      vendors: ["SAP Business One", "Coresystems"],
      caveats: null,
    },
  });
  const r = MariTicketAnalysisSchema.safeParse(n);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.solutionSketch?.problemStillOpen, true);
  assert.match(r.data.solutionSketch!.outline, /Business One/);
});

test("accepts string solutionSketch", () => {
  const n = normalizeMariTicketAnalysisInput({
    summary: "Open issue",
    completeness: { score: 40, missing: [] },
    suggestedTasks: [],
    suggestions: [],
    solutionSketch: "Kurz prüfen und neu starten.",
  });
  const r = MariTicketAnalysisSchema.safeParse(n);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.solutionSketch?.problemStillOpen, true);
});
