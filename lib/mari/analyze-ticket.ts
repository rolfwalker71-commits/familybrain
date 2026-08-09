import { z } from "zod";
import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import type { MariTicketDetail } from "@/lib/mari/tickets";

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
    const action = clip(raw, 300);
    if (!action) return null;
    return { where: "Allgemein", action, detail: null };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const action = asString(
    o.action ?? o.step ?? o.what ?? o.title ?? o.text,
    300
  );
  if (!action) return null;
  return {
    where: asString(o.where ?? o.app ?? o.location ?? o.ort, 120) || "Allgemein",
    action,
    detail: asNullableString(o.detail ?? o.how ?? o.beschreibung, 600),
  };
}

const ARTIFACT_KINDS = new Set([
  "sql_hana",
  "sql_sqlserver",
  "sql",
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
  const code = asString(o.code ?? o.content ?? o.body ?? o.sql ?? o.script, 4500);
  if (!code) return null;
  let kind = asString(o.kind ?? o.type ?? o.format, 40).toLowerCase() || "other";
  if (!ARTIFACT_KINDS.has(kind)) kind = "other";
  const language =
    asString(o.language ?? o.lang, 40) ||
    (kind.startsWith("sql")
      ? kind === "sql_hana"
        ? "sql-hana"
        : "sql"
      : kind === "coresuite_customize"
        ? "csharp"
        : kind === "powershell"
          ? "powershell"
          : kind === "stored_procedure"
            ? "sql"
            : "text");
  return {
    kind,
    title: asString(o.title ?? o.name ?? o.label, 120) || "Artefakt",
    language,
    code,
    note: asNullableString(o.note ?? o.hinweis ?? o.caveat, 400),
  };
}

function normalizeSolutionSketch(raw: unknown): unknown {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const outline = clip(raw, 3500);
    if (!outline) return null;
    return {
      problemStillOpen: true,
      outline,
      vendors: [],
      steps: [],
      artifacts: [],
      caveats:
        "Vorschlag aus allgemeinem Herstellerwissen — mit offizieller Doku abgleichen.",
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const outline = asNullableString(o.outline ?? o.sketch ?? o.text, 3500);
  if (!outline) return null;

  const stepsRaw = Array.isArray(o.steps)
    ? o.steps
    : Array.isArray(o.appSteps)
      ? o.appSteps
      : [];
  const steps = stepsRaw
    .map(normalizeSolutionStep)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 10);

  const artifactsRaw = Array.isArray(o.artifacts)
    ? o.artifacts
    : Array.isArray(o.codeSnippets)
      ? o.codeSnippets
      : [];
  const artifacts = artifactsRaw
    .map(normalizeSolutionArtifact)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 5);

  return {
    problemStillOpen: asBoolean(
      o.problemStillOpen ?? o.applicable ?? o.open,
      true
    ),
    outline,
    vendors: asStringArray(o.vendors ?? o.hersteller, 6, 80),
    steps,
    artifacts,
    caveats: asNullableString(o.caveats ?? o.hinweis, 800),
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
  where: z.string().min(1).max(120),
  /** Was tun */
  action: z.string().min(1).max(300),
  /** Wie genau (Klicks, Felder, Werte) */
  detail: z.string().max(600).nullable().optional(),
});

export const MariSolutionArtifactSchema = z.object({
  kind: z.enum([
    "sql_hana",
    "sql_sqlserver",
    "sql",
    "coresuite_customize",
    "stored_procedure",
    "di_api",
    "service_layer",
    "powershell",
    "script",
    "config",
    "other",
  ]),
  title: z.string().min(1).max(120),
  language: z.string().max(40).default("text"),
  code: z.string().min(1).max(4500),
  note: z.string().max(400).nullable().optional(),
});

export const MariSolutionSketchSchema = z.object({
  /** false wenn Fall bereits gelöst/obsolet — dann UI ausblenden */
  problemStillOpen: z.boolean(),
  /** Kurze Zusammenfassung des Ansatzes */
  outline: z.string().min(1).max(3500),
  vendors: z.array(z.string().max(80)).max(6).default([]),
  /** Konkrete Schritte in Apps / Administration */
  steps: z.array(MariSolutionStepSchema).max(10).default([]),
  /** SQL, Customize-Code, SP, Scripts usw. */
  artifacts: z.array(MariSolutionArtifactSchema).max(5).default([]),
  caveats: z.string().max(800).nullable().optional(),
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

const SYSTEM = `Du bist Buddy, Assistent für Maringo/MARI Support-Tickets (Schweiz, de-CH).
Kontext der Agentur: SAP Business One (B1) + typische Add-ons (z.B. Coresystems/coresuite customize), Microsoft 365/Outlook, verwandte Hersteller.
WICHTIG zu SAP: Es geht IMMER um SAP Business One — NIEMALS um SAP R/3, ECC oder S/4HANA. Keine S/4-/R3-Transaktionscodes, Fiori-Apps oder ECC-Hinweise vorschlagen.

Analysiere das Ticket inkl. Verlauf und liefere ein JSON-Objekt genau in diesem Schema:
{
  "summary": "string, max ~800 Zeichen",
  "completeness": {
    "score": 0-100 (Zahl, nicht String),
    "missing": ["fehlende Info", ...],
    "notes": "optional string"
  },
  "suggestedTasks": [
    { "title": "string", "reason": "optional", "dueHint": "YYYY-MM-DD oder null" }
  ],
  "suggestions": ["Handlungsempfehlung", ...],
  "recommendedStatus": {
    "statusId": 11|1|3|6|7|14|2|null,
    "label": "optional",
    "reason": "optional"
  } | null,
  "nextReplyDraft": "Kundenantwort DE oder null",
  "solutionSketch": {
    "problemStillOpen": true|false,
    "outline": "Kurzfassung des Lösungsansatzes (warum dieser Weg)",
    "vendors": ["SAP Business One", "Microsoft", "Coresystems", "..."],
    "steps": [
      {
        "where": "App/Modul/Ort, z.B. SAP B1 → Verwaltung → Systeminitialisierung",
        "action": "Was tun (kurz)",
        "detail": "Wie genau: Menüpfad, Felder, Werte, Reihenfolge — oder null"
      }
    ],
    "artifacts": [
      {
        "kind": "sql_hana|sql_sqlserver|sql|coresuite_customize|stored_procedure|di_api|service_layer|powershell|script|config|other",
        "title": "kurzer Titel",
        "language": "sql-hana|sql|csharp|js|powershell|json|text|…",
        "code": "vollständiger Vorschlags-Code / Query",
        "note": "optional: wann welche Variante / Vorsicht"
      }
    ],
    "caveats": "Unsicherheiten / bitte offizielle Docs prüfen — oder null"
  } | null
}

Zu solutionSketch — AUSFORMULIERT und HANDLUNGSFÄHIG:
- Nur wenn das Problem laut Status/Verlauf noch relevant/offen wirkt. Sonst problemStillOpen=false und outline kurz «nicht nötig» ODER solutionSketch=null.
- outline: kurze Zusammenfassung. Die Detailarbeit gehört in steps + artifacts.
- steps: konkrete UI-/Admin-Schritte («wo klicken», «welches Fenster», «welches Feld setzen»). Nicht vage («prüfen»), sondern navigierbar.
- artifacts: IMMER liefern, wenn Diagnose oder Fix Code/SQL/Script braucht:
  - Daten prüfen / Ursache finden → Diagnose-Query. Wenn unklar ob HANA oder SQL Server: BEIDE Varianten als zwei artifacts (kind sql_hana und sql_sqlserver), mit note welche DB.
  - HANA: quoted Identifiers ("OCRD"), oft Schema beachten; SQL Server: eckige Klammern ok.
  - coresuite / Coresystems Customize-Regel → kind coresuite_customize, plausibler C#-ähnlicher Customize-Code (Event, Bedingung, Aktion) als Vorschlag.
  - Stored Procedure / Function → kind stored_procedure inkl. CREATE/ALTER-Skizze.
  - DI-API / Service Layer → kurzes Snippet (kind di_api bzw. service_layer).
  - Config/JSON/XML → kind config.
- Code darf Platzhalter enthalten (z.B. @CardCode, 'KUNDENNR') — klar markieren. Keine erfundenen Note-/KB-Nummern.
- Klar als Vorschlag kennzeichnen; kein Live-Schreiben auf Produktivsysteme ohne Prüfung.
- Bei SAP immer B1-Begriffe (Belegarten, UDF, Addon, DI-API, Service Layer, Formatted Search) — nicht S/4.

Falls Screenshots/Bilder mitgeliefert werden: Fehlerdialoge, Fehlermeldungen, UI-Zustände und relevante Details daraus in summary, missing[], suggestedTasks und solutionSketch (steps/artifacts) einbeziehen.

Status-IDs: 11 NEU, 1 Offen, 3 In Arbeit, 6 Warte auf Kunden, 7 Warte auf Hersteller, 14 Eskalation, 2 Gelöst.
Keine erfundenen Fakten. score als Zahl. Arrays nie weglassen (leer ok). Antworte NUR als JSON-Objekt.`;

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
      const actor = t.actor ? ` · ${t.actor}` : "";
      return `[${t.at}] ${t.label}${actor}\n${t.subject ? t.subject + "\n" : ""}${t.text.slice(0, 800)}`;
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

Anfragetext:
${ticket.requestTextPlain.slice(0, 6000)}

Verlauf (chronologisch):
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
    temperature: 0.2,
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
