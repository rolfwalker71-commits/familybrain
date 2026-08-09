import { z } from "zod";
import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import type { MariTicketDetail } from "@/lib/mari/tickets";
import { timelineSideLabel } from "@/lib/mari/timeline-side";

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function asString(v: unknown, max: number): string {
  if (v == null) return "";
  if (typeof v === "string") return clip(v, max);
  if (typeof v === "number" || typeof v === "boolean") {
    return clip(String(v), max);
  }
  return clip(JSON.stringify(v), max);
}

function asNullableString(v: unknown, max: number): string | null {
  if (v == null || v === "") return null;
  const s = asString(v, max);
  return s || null;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", ".").trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asStringArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => asString(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "ja"].includes(s)) return true;
    if (["false", "0", "no", "nein"].includes(s)) return false;
  }
  return fallback;
}

function normalizeSolutionStep(raw: unknown): {
  where: string;
  action: string;
  detail: string | null;
} | null {
  if (typeof raw === "string") {
    const action = clip(raw, 500);
    if (!action) return null;
    return { where: "Allgemein", action, detail: null };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const action = asString(
    o.action ?? o.step ?? o.what ?? o.title ?? o.text,
    500
  );
  if (!action) return null;
  return {
    where: asString(o.where ?? o.app ?? o.location ?? o.ort, 200) || "Allgemein",
    action,
    detail: asNullableString(o.detail ?? o.how ?? o.beschreibung, 1600),
  };
}

const ARTIFACT_KINDS = new Set([
  "sql_hana",
  "sql_sqlserver",
  "sql",
  "transaction_notification",
  "formatted_search",
  "coresuite_customize",
  "stored_procedure",
  "di_api",
  "service_layer",
  "powershell",
  "script",
  "config",
  "other",
]);

function normalizeSolutionArtifact(raw: unknown): {
  kind: string;
  title: string;
  language: string;
  code: string;
  note: string | null;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const code = asString(
    o.code ?? o.content ?? o.body ?? o.sql ?? o.script,
    9000
  );
  if (!code) return null;
  let kind = asString(o.kind ?? o.type ?? o.format, 40).toLowerCase() || "other";
  if (kind === "tn" || kind === "sbo_sp_transactionnotification") {
    kind = "transaction_notification";
  }
  if (kind === "fs" || kind === "formattedsearch") {
    kind = "formatted_search";
  }
  if (!ARTIFACT_KINDS.has(kind)) kind = "other";
  const language =
    asString(o.language ?? o.lang, 40) ||
    (kind.startsWith("sql") ||
    kind === "transaction_notification" ||
    kind === "stored_procedure" ||
    kind === "formatted_search"
      ? kind === "sql_hana"
        ? "sql-hana"
        : "sql"
      : kind === "coresuite_customize"
        ? "csharp"
        : kind === "powershell"
          ? "powershell"
          : "text");
  return {
    kind,
    title: asString(o.title ?? o.name ?? o.label, 160) || "Artefakt",
    language,
    code,
    note: asNullableString(o.note ?? o.hinweis ?? o.caveat, 800),
  };
}

function normalizeSolutionSketch(raw: unknown): unknown {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const outline = clip(raw, 6000);
    if (!outline) return null;
    return {
      problemStillOpen: true,
      outline,
      vendors: [],
      steps: [],
      artifacts: [],
      caveats:
        "Vorschlag aus allgemeinem Herstellerwissen — mit help.sap.com / offizieller Doku abgleichen.",
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const outline = asNullableString(o.outline ?? o.sketch ?? o.text, 6000);
  if (!outline) return null;

  const stepsRaw = Array.isArray(o.steps)
    ? o.steps
    : Array.isArray(o.appSteps)
      ? o.appSteps
      : [];
  const steps = stepsRaw
    .map(normalizeSolutionStep)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 16);

  const artifactsRaw = Array.isArray(o.artifacts)
    ? o.artifacts
    : Array.isArray(o.codeSnippets)
      ? o.codeSnippets
      : [];
  const artifacts = artifactsRaw
    .map(normalizeSolutionArtifact)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 8);

  return {
    problemStillOpen: asBoolean(
      o.problemStillOpen ?? o.applicable ?? o.open,
      true
    ),
    outline,
    vendors: asStringArray(o.vendors ?? o.hersteller, 8, 80),
    steps,
    artifacts,
    caveats: asNullableString(o.caveats ?? o.hinweis, 1500),
  };
}

/** Normalize loose AI JSON before Zod (common type/length drift). */
export function normalizeMariTicketAnalysisInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      summary: "",
      completeness: { score: 0, missing: [], notes: "" },
      suggestedTasks: [],
      suggestions: [],
      recommendedStatus: null,
      nextReplyDraft: null,
      solutionSketch: null,
    };
  }
  const o = raw as Record<string, unknown>;
  const completenessRaw =
    o.completeness && typeof o.completeness === "object" && !Array.isArray(o.completeness)
      ? (o.completeness as Record<string, unknown>)
      : {};

  const tasksRaw = Array.isArray(o.suggestedTasks) ? o.suggestedTasks : [];
  const suggestedTasks = tasksRaw.slice(0, 8).map((item) => {
    const t: Record<string, unknown> =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : { title: item };
    return {
      title: asString(t.title, 200) || "Aufgabe",
      reason: asNullableString(t.reason, 300) ?? undefined,
      dueHint: asNullableString(t.dueHint, 40),
    };
  });

  let recommendedStatus: unknown = null;
  const rs = o.recommendedStatus;
  if (rs && typeof rs === "object" && !Array.isArray(rs)) {
    const r = rs as Record<string, unknown>;
    const statusIdRaw = r.statusId;
    let statusId: number | null = null;
    if (statusIdRaw != null && statusIdRaw !== "") {
      const n = asNumber(statusIdRaw, NaN);
      statusId = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    recommendedStatus = {
      statusId,
      label: asNullableString(r.label, 80) ?? undefined,
      reason: asNullableString(r.reason, 300) ?? undefined,
    };
  } else if (typeof rs === "string" && rs.trim()) {
    recommendedStatus = {
      statusId: null,
      label: clip(rs, 80),
      reason: undefined,
    };
  }

  const score = Math.min(100, Math.max(0, Math.round(asNumber(completenessRaw.score, 0))));

  return {
    summary: asString(o.summary, 800) || "Keine Zusammenfassung.",
    completeness: {
      score,
      missing: asStringArray(completenessRaw.missing, 10, 200),
      notes: asNullableString(completenessRaw.notes, 500) ?? undefined,
    },
    suggestedTasks,
    suggestions: asStringArray(o.suggestions, 8, 300),
    recommendedStatus,
    nextReplyDraft: asNullableString(o.nextReplyDraft, 2000),
    solutionSketch: normalizeSolutionSketch(o.solutionSketch),
  };
}

export const MariSolutionStepSchema = z.object({
  /** App / Modul / Ort (z.B. «SAP B1 → Verwaltung → …», «coresuite Designer») */
  where: z.string().min(1).max(200),
  /** Was tun */
  action: z.string().min(1).max(500),
  /** Wie genau: Klicks, Felder, Werte, Reihenfolge */
  detail: z.string().max(1600).nullable().optional(),
});

export const MariSolutionArtifactSchema = z.object({
  kind: z.enum([
    "sql_hana",
    "sql_sqlserver",
    "sql",
    "transaction_notification",
    "formatted_search",
    "coresuite_customize",
    "stored_procedure",
    "di_api",
    "service_layer",
    "powershell",
    "script",
    "config",
    "other",
  ]),
  title: z.string().min(1).max(160),
  language: z.string().max(40).default("text"),
  code: z.string().min(1).max(9000),
  note: z.string().max(800).nullable().optional(),
});

export const MariSolutionSketchSchema = z.object({
  /** false wenn Fall bereits gelöst/obsolet — dann UI ausblenden */
  problemStillOpen: z.boolean(),
  /** Ausführliche Analyse / Lösungsstrategie */
  outline: z.string().min(1).max(6000),
  vendors: z.array(z.string().max(80)).max(8).default([]),
  /** Step-by-step in Apps / Administration */
  steps: z.array(MariSolutionStepSchema).max(16).default([]),
  /** SQL/HANA, TN, Customize, SP, Scripts usw. */
  artifacts: z.array(MariSolutionArtifactSchema).max(8).default([]),
  caveats: z.string().max(1500).nullable().optional(),
});

export const MariTicketAnalysisSchema = z.object({
  summary: z.string().min(1).max(800),
  completeness: z.object({
    score: z.number().min(0).max(100),
    missing: z.array(z.string().max(200)).max(10),
    notes: z.string().max(500).optional(),
  }),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        reason: z.string().max(300).optional(),
        dueHint: z.string().max(40).nullable().optional(),
      })
    )
    .max(8),
  suggestions: z.array(z.string().max(300)).max(8),
  recommendedStatus: z
    .object({
      statusId: z.number().int().positive().nullable().optional(),
      label: z.string().max(80).optional(),
      reason: z.string().max(300).optional(),
    })
    .nullable()
    .optional(),
  nextReplyDraft: z.string().max(2000).nullable().optional(),
  solutionSketch: MariSolutionSketchSchema.nullable().optional(),
});

export type MariTicketAnalysis = z.infer<typeof MariTicketAnalysisSchema>;
export type MariSolutionSketch = z.infer<typeof MariSolutionSketchSchema>;

const SYSTEM = `Du bist Buddy, Senior-Support-Assistent für Maringo/MARI Tickets (Schweiz, de-CH).
Kontext: SAP Business One (B1) inkl. HANA/SQL Server, Transaction Notification (SBO_SP_TransactionNotification), Formatted Search, UDFs/UDT, DI-API, Service Layer, Add-ons (Coresystems/coresuite customize), Microsoft 365/Outlook u.ä.
WICHTIG zu SAP: IMMER SAP Business One — NIEMALS R/3, ECC, S/4HANA, Fiori oder ECC-T-Codes.

Nachschlagewerke (in caveats/outline nennen, wenn relevant — keine erfundenen Note-Nummern):
- https://help.sap.com → SAP Business One (Produktbereich), auch Partner Edge / Support Launchpad Themen
- Microsoft Learn für Graph/Outlook/M365
- Coresystems/coresuite öffentliche Doku für Customize

Verlauf-Legende ([Seite: …]):
- «Support (wir)» = eure Antworten/Rückfragen/Notizen — keine Kundenfakten.
- «Kunde» = Kundenmeldung/Eingang.
- «System» = automatische Feldänderungen.
- «Unklar» = nicht als Kundenfakt werten.
Support- und Kundenaussagen getrennt auswerten; bereits geklärte Punkte nicht erneut fragen.

Liefere JSON genau in diesem Schema:
{
  "summary": "string, max ~800 Zeichen",
  "completeness": { "score": 0-100, "missing": ["…"], "notes": "optional" },
  "suggestedTasks": [{ "title": "…", "reason": "optional", "dueHint": "YYYY-MM-DD|null" }],
  "suggestions": ["…"],
  "recommendedStatus": { "statusId": 11|1|3|6|7|14|2|null, "label": "optional", "reason": "optional" } | null,
  "nextReplyDraft": "Kundenantwort DE oder null",
  "solutionSketch": {
    "problemStillOpen": true|false,
    "outline": "AUSFÜHRLICHE Analyse: Hypothesen, warum der Fehler auftritt, betroffene B1-Objekte/Tabellen (OCRD, OINV, …), Risiken, Alternativen",
    "vendors": ["SAP Business One", "…"],
    "steps": [
      {
        "where": "konkreter Ort (Client-Menü, SQL Studio, B1 Studio, coresuite Designer, …)",
        "action": "Was genau",
        "detail": "Step-by-step: Klicks, Felder, erwartetes Ergebnis, Fallback wenn Schritt scheitert"
      }
    ],
    "artifacts": [
      {
        "kind": "sql_hana|sql_sqlserver|sql|transaction_notification|formatted_search|coresuite_customize|stored_procedure|di_api|service_layer|powershell|script|config|other",
        "title": "…",
        "language": "sql-hana|sql|csharp|js|powershell|json|text|…",
        "code": "AUSFÜHRLICHES, lauffähig skizziertes Skript (Kommentare, Platzhalter klar)",
        "note": "DB-Variante, Deploy-Hinweis, Test auf Testfirma, help.sap.com Thema"
      }
    ],
    "caveats": "Unsicherheiten + wo in help.sap.com / Doku nachschlagen"
  } | null
}

solutionSketch — UMFANGREICH und PRAXISTAUGICH (Support-Qualität):
- Nur wenn Problem noch offen; sonst problemStillOpen=false oder null.
- outline: nicht nur 2 Sätze — Ursache, Auswirkungen, Lösungsstrategie, was man zuerst prüft vs. was man ändert. Bei B1: Objekttypen, Belegfluss, Autorisierung, Addon-Einfluss.
- steps: 4–12 navigierbare Schritte wo sinnvoll (Diagnose → Fix → Verifikation). Detail pro Schritt ausführlich.
- artifacts: LIEFERE substanzielle Skripte, sobald Daten/Regeln involviert sind:
  1) Diagnose-SELECTs (Joins auf Standardtabellen, Filter mit Platzhaltern @CardCode / 'DOCNR').
  2) Wenn DB unklar: BEIDES sql_hana UND sql_sqlserver.
     HANA: "Quoted" Identifiers; SQL Server: [Klammern] ok.
  3) Transaction Notification: kind transaction_notification — vollständige SBO_SP_TransactionNotification-Skizze mit @object_type, @transaction_type, @num_of_cols_in_key, @list_of_key_cols_tab_del, @list_of_cols_val_tab_del, error/@error/@error_message Pattern, IF-Blöcke, Kommentare wo einhängen. Hinweis: nur auf Testfirma prüfen.
  4) Formatted Search: kind formatted_search — Query + wo im Formular zuweisen.
  5) coresuite_customize: Event/Bedingung/Aktion als C#-ähnlicher Vorschlag.
  6) stored_procedure / DI-API / Service Layer / PowerShell / Config wenn passend.
- Skripte: kommentiert, idempotent wo möglich, keine destruktiven UPDATEs ohne klaren WHERE und Warnung in note.
- Keine erfundenen SAP-Note-/KB-Nummern; lieber Themenpfad («help.sap.com → Business One → …»).
- Klar als Vorschlag; kein Blind-Deploy auf Produktiv.
- Bereits gegebene Support-Infos im Verlauf berücksichtigen.

Screenshots: Fehlermeldungen/UI in summary, missing, steps und artifacts einbeziehen.

Status-IDs: 11 NEU, 1 Offen, 3 In Arbeit, 6 Warte auf Kunden, 7 Warte auf Hersteller, 14 Eskalation, 2 Gelöst.
score als Zahl. Arrays nie weglassen (leer ok). NUR JSON-Objekt.`;

export type AnalyzeMariTicketResult = MariTicketAnalysis & {
  imagesAnalyzed: number;
  imageNames: string[];
  usage: AiTokenUsage;
};

export async function analyzeMariTicket(
  ticket: MariTicketDetail,
  options?: {
    images?: Array<{
      dataUrl: string;
      orgFilename: string;
      mimeType: string;
    }>;
  }
): Promise<AnalyzeMariTicketResult> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen → OpenAI).");
  }

  const images = (options?.images || []).slice(0, 6);
  const imageNames = images.map((i) => i.orgFilename).filter(Boolean);

  const timelineText = ticket.timeline
    .slice(-40)
    .map((t) => {
      const side = timelineSideLabel(t.side || "unknown");
      const actor = t.actor ? ` · Actor: ${t.actor}` : "";
      const meta = t.meta ? ` · ${t.meta}` : "";
      const att =
        t.attachments && t.attachments.length > 0
          ? `\nAnhänge: ${t.attachments.map((a) => a.orgFilename).join(", ")}`
          : "";
      return `[Seite: ${side}] [${t.at}] ${t.label}${actor}${meta}\n${
        t.subject ? t.subject + "\n" : ""
      }${t.text.slice(0, 800)}${att}`;
    })
    .join("\n\n");

  const userPrompt = `Ticket #${ticket.issueId}
Betreff: ${ticket.briefDescription}
Status: ${ticket.statusName} (${ticket.status})
Typ: ${ticket.issueTypeName || "–"}
Produkt: ${ticket.productName || "–"} (SAP-Kontext = Business One, nicht S/4)
Priorität: ${ticket.priorityName}
Kunde: ${ticket.cardCode || "–"}${ticket.addressMatchcode ? ` · ${ticket.addressMatchcode}` : ""}
Supportgruppe: ${ticket.supportGroupName || "–"}
Fällig: ${ticket.dueDate || "–"}
Zuständig: ${ticket.handledByName || ticket.responsible || "–"}
Screenshots/Bilder: ${
    imageNames.length
      ? `${imageNames.length} Datei(en): ${imageNames.join(", ")}`
      : "keine"
  }

Anfragetext (ursprünglich, oft Kunde):
${ticket.requestTextPlain.slice(0, 6000)}

Verlauf (chronologisch; [Seite: Support (wir)|Kunde|System|Unklar] markiert den Absender):
${timelineText.slice(0, 14000) || "(keine Positionen)"}`;

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "auto" } };

  const userContent: string | ContentPart[] =
    images.length === 0
      ? userPrompt
      : [
          { type: "text", text: userPrompt },
          ...images.map(
            (img): ContentPart => ({
              type: "image_url",
              image_url: { url: img.dataUrl, detail: "low" },
            })
          ),
        ];

  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.25,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI-Antwort war kein gültiges JSON.");
  }

  const normalized = normalizeMariTicketAnalysisInput(parsed);
  const result = MariTicketAnalysisSchema.safeParse(normalized);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      detail
        ? `AI-Antwort entsprach nicht dem Schema (${detail}).`
        : "AI-Antwort entsprach nicht dem Schema."
    );
  }
  return {
    ...result.data,
    imagesAnalyzed: images.length,
    imageNames,
    usage: buildAiTokenUsage(model, completion.usage),
  };
}
