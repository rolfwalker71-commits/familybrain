import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAnalysisAsInternalCommentHtml,
  formatPlainTextAsExternalCommentHtml,
  formatPlainTextAsInternalCommentHtml,
  looksLikeMariHtml,
} from "@/lib/mari/internal-note";
import type { MariTicketAnalysis } from "@/lib/mari/analyze-ticket";

test("formats plain external note without internal banner", () => {
  const html = formatPlainTextAsExternalCommentHtml(
    'Hallo <b>Kunde</b> & "Team"'
  );
  assert.match(html, /Hallo &lt;b&gt;Kunde&lt;\/b&gt; &amp; &quot;Team&quot;/);
  assert.doesNotMatch(html, /Nur intern/);
  assert.doesNotMatch(html, /Buddy Notiz/);
});

test("formats plain internal note as escaped HTML", () => {
  const html = formatPlainTextAsInternalCommentHtml(
    'Check <script> & "quotes"',
    { issueId: 42 }
  );
  assert.match(html, /Buddy Notiz/);
  assert.match(html, /Ticket #42/);
  assert.match(html, /Check &lt;script&gt; &amp; &quot;quotes&quot;/);
  assert.doesNotMatch(html, /<script>/);
});

test("analysis HTML includes solution sketch code 1:1", () => {
  const analysis: MariTicketAnalysis = {
    summary: "Login schlägt fehl.",
    completeness: { score: 55, missing: ["Logs"], notes: "Bitte nachfassen" },
    suggestedTasks: [
      { title: "Logs anfordern", reason: "fehlt", dueHint: "2026-08-12" },
    ],
    suggestions: ["Version prüfen"],
    recommendedStatus: {
      statusId: 6,
      label: "Warte auf Kunden",
      reason: "Info fehlt",
    },
    nextReplyDraft: "Hallo Andrej\n\nBitte Logs schicken.",
    solutionSketch: {
      problemStillOpen: true,
      outline: "Vermutlich UDF-Validierung in OCRD.",
      vendors: ["SAP Business One"],
      steps: [
        {
          where: "B1 → Geschäftspartner",
          action: "UDF prüfen",
          detail: "Feld U_XYZ öffnen",
        },
      ],
      artifacts: [
        {
          kind: "sql_hana",
          title: "BP prüfen",
          language: "sql-hana",
          code: 'SELECT "CardCode" FROM "OCRD" WHERE "CardCode" = \'C00001\'',
          note: "Nur Testfirma",
        },
        {
          kind: "transaction_notification",
          title: "TN Skizze",
          language: "sql",
          code: "IF @object_type = '2' BEGIN SELECT 1 END",
        },
      ],
      caveats: "Mit help.sap.com abgleichen",
    },
  };

  const html = formatAnalysisAsInternalCommentHtml(analysis, { issueId: 99 });
  assert.match(html, /Buddy AI-Analyse/);
  assert.match(html, /Login schlägt fehl/);
  assert.match(html, /Vollständigkeit: 55\/100/);
  assert.match(html, /Logs anfordern/);
  assert.match(html, /Lösungsansatz \(ausführlich\)/);
  assert.match(html, /Vermutlich UDF-Validierung/);
  assert.match(html, /Queries \/ Skripte \/ Code/);
  assert.match(html, /BP prüfen/);
  assert.match(html, /SELECT &quot;CardCode&quot; FROM &quot;OCRD&quot;/);
  assert.match(html, /TN Skizze/);
  assert.match(html, /IF @object_type = '2'/);
  assert.match(html, /Antwort-Entwurf/);
  assert.match(html, /Hallo Andrej/);
  assert.match(html, /Warte auf Kunden/);
  assert.ok(looksLikeMariHtml(html));
});
