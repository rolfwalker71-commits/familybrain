import assert from "node:assert/strict";
import test from "node:test";
import {
  MariTicketAnalysisSchema,
  isHollowMariTicketAnalysis,
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
      steps: [
        {
          where: "SAP B1 → Verwaltung",
          action: "UDF prüfen",
          detail: "Feld U_XYZ am BP öffnen",
        },
      ],
      artifacts: [
        {
          kind: "sql_hana",
          title: "BP prüfen",
          code: 'SELECT "CardCode" FROM "OCRD" WHERE "CardCode" = \'C00001\'',
        },
        {
          kind: "coresuite_customize",
          title: "BeforeAdd Regel",
          language: "csharp",
          code: "// placeholder customize\nif (true) { }",
          note: "Nur Skizze",
        },
        {
          kind: "tn",
          title: "Transaction Notification",
          code: "-- SBO_SP_TransactionNotification skizze\nIF @object_type = '2' BEGIN SELECT 1 END",
        },
      ],
      caveats: "help.sap.com → SAP Business One prüfen",
    },
  });
  const r = MariTicketAnalysisSchema.safeParse(n);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.solutionSketch?.problemStillOpen, true);
  assert.match(r.data.solutionSketch!.outline, /Business One/);
  assert.equal(r.data.solutionSketch!.steps.length, 1);
  assert.equal(r.data.solutionSketch!.artifacts.length, 3);
  assert.equal(r.data.solutionSketch!.artifacts[0]!.kind, "sql_hana");
  assert.equal(
    r.data.solutionSketch!.artifacts[1]!.kind,
    "coresuite_customize"
  );
  assert.equal(
    r.data.solutionSketch!.artifacts[2]!.kind,
    "transaction_notification"
  );
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

test("detects hollow placeholder analysis", () => {
  const hollow = normalizeMariTicketAnalysisInput({
    summary: "",
    completeness: { score: 0, missing: [] },
    suggestedTasks: [],
    suggestions: [],
  });
  const r = MariTicketAnalysisSchema.safeParse(hollow);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(isHollowMariTicketAnalysis(r.data), true);

  const ok = normalizeMariTicketAnalysisInput({
    summary: "Kunde meldet Fehler beim Login.",
    completeness: { score: 40, missing: ["Logs"] },
    suggestedTasks: [{ title: "Logs anfordern", reason: "fehlt" }],
    suggestions: [],
  });
  const r2 = MariTicketAnalysisSchema.safeParse(ok);
  assert.equal(r2.success, true);
  if (!r2.success) return;
  assert.equal(isHollowMariTicketAnalysis(r2.data), false);
});
