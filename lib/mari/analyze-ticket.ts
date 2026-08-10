import { getAnalysisClient, getChatJsonRequestExtras, hasChatKey, hasOpenAIKey } from "@/lib/ai/client";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import type { MariTicketDetail } from "@/lib/mari/tickets";
import { timelineSideLabel } from "@/lib/mari/timeline-side";
import {
  detectReplyAddressForm,
  detectReplyLanguage,
  replyAddressFormInstruction,
} from "@/lib/microsoft/reply-language-shared";
import type OpenAI from "openai";
import { z } from "zod";

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
  "bash",
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
  if (
    kind === "shell" ||
    kind === "linux" ||
    kind === "bash_script" ||
    kind === "sh"
  ) {
    kind = "bash";
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
          : kind === "bash"
            ? "bash"
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
    .slice(0, 12);

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
    "bash",
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
  artifacts: z.array(MariSolutionArtifactSchema).max(12).default([]),
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

/** Heuristik: relevante Hersteller/Produkte aus Tickettext für den Prompt. */
export function detectRelevantVendorsFromTicketText(text: string): string[] {
  const t = (text || "").toLowerCase();
  const found: string[] = [];
  const add = (label: string, re: RegExp) => {
    if (re.test(t) && !found.includes(label)) found.push(label);
  };
  add("SAP Business One", /\b(sap\s*b1|business\s*one|sbo\b|ocrd|oinv|di-?api|service\s*layer|udf|udt|formatted\s*search|transaction\s*notification)\b/i);
  add("SAP HANA", /\b(hana|sqlscript|hdbsql|hdbdaemon|hdbindexserver)\b/i);
  add("Linux / OS", /\b(linux|suse|rhel|redhat|ubuntu|systemd|ssh|bash|shell|df\s+-h|journalctl)\b/i);
  add("Coresystems coresuite", /\b(coresystems|coresuite|core\s*suite|customize)\b/i);
  add("Boyum IT", /\b(boyum|b1up|b1\s*usability|produmex|print\s*&\s*delivery|boyum\s*insight)\b/i);
  add("Produmex", /\bprodumex\b/i);
  add("Microsoft 365", /\b(microsoft|m365|office\s*365|outlook|exchange|graph\s*api|entra|azure\s*ad|teams|power\s*automate)\b/i);
  add("Maringo MARI", /\b(maringo|mari\b|hotline)\b/i);
  // B1-Kontext ohne explizites SAP-Wort: Standardtabellen / Support-Stack
  if (
    !found.some((v) => v.startsWith("SAP")) &&
    /\b(beleg|geschäftspartner|artikelstamm|lagerverwaltung)\b/i.test(t)
  ) {
    found.unshift("SAP Business One");
  }
  return found.slice(0, 8);
}

const SYSTEM = `Du bist Buddy, Senior-Support-Assistent für Maringo/MARI Tickets (Schweiz, de-CH).
Kontext: SAP Business One (B1) inkl. HANA/SQL Server, Transaction Notification (SBO_SP_TransactionNotification), Formatted Search, UDFs/UDT, DI-API, Service Layer, Add-ons (Coresystems/coresuite, Boyum IT), Microsoft 365/Outlook/Graph, Maringo/MARI u.ä.
WICHTIG zu SAP: IMMER SAP Business One — NIEMALS R/3, ECC, S/4HANA, Fiori oder ECC-T-Codes.

HERSTELLER / PRODUKTWISSEN (solutionSketch — Pflicht wenn relevant):
Ermittle aus Ticket-Produkt, Betreff, Anfrage und Verlauf, welche Hersteller/Produkte betroffen sind, und nutze typisches Produktwissen in outline/steps/artifacts/caveats. vendors[] muss die relevanten Namen listen.
Typische Quellen (Themenpfade nennen — KEINE erfundenen Note-/KB-Nummern):
- SAP Business One: https://help.sap.com → SAP Business One; Partner Edge / Support Launchpad; Standardtabellen OCRD/OINV/…, Autorisierung, Belegfluss, UDF/UDT, DI-API, Service Layer, TN, Formatted Search.
- Coresystems / coresuite: öffentliche coresuite-Doku (Customize Events/Conditions/Actions, Mobile, Time); Designer-Schritte und C#-ähnliche Customize-Skizzen wenn Addon betroffen.
- Boyum IT: B1 Usability Package (B1UP), Produmex WMS/Scan, Boyum Print & Delivery / Insight — nur wenn Ticket/Produkt darauf hindeutet; UI-Pfade und typische Config-Checks nennen.
- Microsoft: Microsoft Learn (Graph, Outlook/Exchange, Entra ID, Teams, Power Automate) wenn M365/Mail/Auth betroffen.
- Maringo / MARI: Ticket-/Support-Prozess nur wenn Buddy/MARI selbst Thema ist.
- Weitere (Produmex, Beas, Boyum-Module, lokale Add-ons): nur wenn im Ticket erkennbar; in vendors[] und caveats Doku-Hinweis.
In outline: kurz sagen, welches Herstellerverhalten/Limit bekannt ist (z. B. Customize-Event-Reihenfolge, B1UP-Regel vs. TN, Graph-Throttling) — als Support-Hypothese, nicht als garantierte Spec.

HANA SQL (kind sql_hana / language sql-hana) — SYNTAX HART:
- Nur SAP HANA SQL / SQLScript-Notation — KEINE SQL-Server-Syntax mischen.
- Identifier doppelt quoten: "OCRD", "CardCode", "DocEntry" (B1-HANA-Standard).
- KEINE eckigen Klammern [OCRD], kein GO, kein ISNULL() → IFNULL() oder COALESCE().
- String-Verkettung mit || (nicht +).
- TOP: SELECT TOP 100 "CardCode" FROM "OCRD" … (oder LIMIT am Ende, konsistent HANA).
- Kommentare: -- und /* */.
- Schema/Firmen-DB als Platzhalter kommentieren (z. B. /* Schema = aktuelle Firmen-DB */), keine erfundenen Schema-Namen als Fakt.
- Diagnose-SELECTs kommentiert, Platzhalter klar ('C00001' / /* @CardCode */).
- SQL IMMER doppelt: sql_hana UND sql_sqlserver als getrennte artifacts (nie nur eine Variante, auch wenn HANA im Ticket steht).
- MS SQL (sql_sqlserver): [OCRD]/[CardCode], ISNULL ok, String-Verkettung oft +; keine HANA-only-Funktionen.
- Transaction Notification: HANA = SQLSCRIPT (IN/OUT ohne @); SQL Server = @object_type/@transaction_type/… — wenn TN geliefert wird, idealerweise BEIDE Varianten. Nie HANA-Artifact mit T-SQL-@Variablen als «HANA» ausgeben.

LINUX / HANA-BETRIEB (wenn Ticket Linux, SUSE, RHEL, HANA-Server, Speicher, Dienste, Backup, hdbsql, Indexserver, Netzwerk betrifft):
- Zusätzlich praxisnahe Diagnose-/Fix-Hilfen liefern:
  1) kind bash / language bash: Shell-Befehle (systemctl status/restart für HANA-Dienste wo üblich, df -h, free -h, journalctl, top/htop, ls -la auf Trace-/Log-Pfade, HDB info / sapcontrol wo passend). Kommentiert, Platzhalter für SID/Instanz/Host.
  2) HANA-seitig: hdbsql-Beispiele, M_*-Monitoring-Views (z. B. M_SERVICES, M_DISK_USAGE, M_CONNECTIONS) als sql_hana — und parallel sql_sqlserver nur wenn B1-Datenbank-SQL gemeint ist; bei reinem HANA-OS/DB-Admin reichen bash + sql_hana.
- Keine destruktiven rm -rf / DROP ohne klare Warnung in note; kein Blind-Restart auf Produktiv ohne Hinweis.
- steps: wo relevant Linux-Pfad und HANA Studio/Database Explorer nennen.

Nachschlagewerke (in caveats/outline):
- https://help.sap.com → SAP Business One
- Microsoft Learn für Graph/Outlook/M365
- Coresystems/coresuite öffentliche Doku
- Boyum IT Help/Knowledge Base (wenn Boyum-Produkt betroffen)

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
  "nextReplyDraft": "Kundenantwort in der Sprache/Anrede des Verlaufs oder null",
  "solutionSketch": {
    "problemStillOpen": true|false,
    "outline": "AUSFÜHRLICHE Analyse inkl. relevanter Hersteller-Hinweise: Hypothesen, B1-Objekte/Tabellen, Addon-/Cloud-Einfluss, Risiken, Alternativen",
    "vendors": ["SAP Business One", "Coresystems coresuite", "…"],
    "steps": [
      {
        "where": "konkreter Ort (Client-Menü, HANA Studio/Database Explorer, B1 Studio, coresuite Designer, Boyum/B1UP, …)",
        "action": "Was genau",
        "detail": "Step-by-step: Klicks, Felder, erwartetes Ergebnis, Fallback wenn Schritt scheitert"
      }
    ],
    "artifacts": [
      {
        "kind": "sql_hana|sql_sqlserver|sql|transaction_notification|formatted_search|coresuite_customize|stored_procedure|di_api|service_layer|powershell|bash|script|config|other",
        "title": "…",
        "language": "sql-hana|sql|csharp|js|powershell|bash|json|text|…",
        "code": "AUSFÜHRLICHES, lauffähig skizziertes Skript (Kommentare, Platzhalter klar; HANA nur HANA-Syntax)",
        "note": "DB-Variante, Deploy-Hinweis, Test auf Testfirma, Doku-Themenpfad"
      }
    ],
    "caveats": "Unsicherheiten + Doku-Pfade je Hersteller"
  } | null
}

solutionSketch — UMFANGREICH und PRAXISTAUGICH (Support-Qualität):
- Nur wenn Problem noch offen; sonst problemStillOpen=false oder null.
- outline: nicht nur 2 Sätze — Ursache, Auswirkungen, Lösungsstrategie, Hersteller-Kontext, was man zuerst prüft vs. ändert.
- vendors: alle aus Ticket erkennbaren relevanten Hersteller/Produkte (mind. SAP Business One wenn B1-Thema).
- steps: 4–12 navigierbare Schritte wo sinnvoll (Diagnose → Fix → Verifikation), inkl. Addon-/Hersteller-UI wenn betroffen.
- artifacts: LIEFERE substanzielle Skripte, sobald Daten/Regeln involviert sind:
  1) Diagnose-SELECTs (Joins, Filter mit Platzhaltern).
  2) SQL IMMER doppelt: je ein artifact kind sql_hana UND ein artifact kind sql_sqlserver mit gleichem Zweck (Titel z. B. «BP prüfen (HANA)» / «BP prüfen (SQL Server)»). Auch wenn nur HANA oder nur SQL Server im Ticket steht — Kundenumgebung oft unklar.
  3) Transaction Notification: wenn relevant, möglichst HANA-SQLSCRIPT und SQL-Server-Variante als zwei artifacts; note = Ziel-DB.
  4) Formatted Search: kind formatted_search — Query + Zuweisung im Formular (bei SQL-FS ebenfalls HANA + SQL Server wenn Query-basiert).
  5) coresuite_customize wenn Coresystems/coresuite relevant.
  6) config/script für Boyum/B1UP/Produmex wenn erkennbar.
  7) DI-API / Service Layer / PowerShell / Graph wenn passend.
  8) Bei Linux/HANA-Betrieb: bash (Shell-Diagnose/Fix) und ggf. HANA-Monitoring-SQL (M_*-Views / hdbsql) — siehe LINUX / HANA-BETRIEB.
- VERBOTEN: nur sql_hana ohne sql_sqlserver (oder umgekehrt), sobald irgendein B1-Firmen-DB SQL-Diagnose-/Fix-Skript vorkommt (reine HANA-OS-Admin-Skripte ausgenommen).
- Skripte: kommentiert, idempotent wo möglich, keine destruktiven UPDATEs ohne klaren WHERE und Warnung in note.
- Keine erfundenen SAP-Note-/KB-Nummern; Themenpfade statt Fantasie-IDs.
- Klar als Vorschlag; kein Blind-Deploy auf Produktiv.
- Bereits gegebene Support-Infos im Verlauf berücksichtigen.

Screenshots: Fehlermeldungen/UI in summary, missing, steps und artifacts einbeziehen.

nextReplyDraft — ANREDE (hart):
- Im User-Prompt steht «Anrede-Muster». Entweder konsequent per Du ODER konsequent formell — nie mischen.
- per Du: Hallo/Hi + Vorname wie im Verlauf; du/dir/dein.
- formell: Sehr geehrte/r bzw. Herr/Frau + Name; Sie/Ihnen/Ihr.
- Eigene Support-Antworten im Verlauf haben Vorrang vor Kundenmails.
- Schlussformel passend (z. B. Freundliche Grüsse) und Schweizer Hochdeutsch (kein ß).

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
  const images = (options?.images || []).slice(0, 6);
  if (images.length > 0 && !hasOpenAIKey()) {
    throw new Error(
      "Screenshots brauchen den OpenAI-Key (Einstellungen → KI-API → OpenAI)."
    );
  }
  if (!hasChatKey() && images.length === 0) {
    throw new Error(
      "Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API)."
    );
  }
  if (!hasChatKey() && !hasOpenAIKey()) {
    throw new Error("KI-API-Key fehlt (Einstellungen → KI-API).");
  }

  const imageNames = images.map((i) => i.orgFilename).filter(Boolean);

  const recentTimeline = ticket.timeline.slice(-40);
  const supportTexts = recentTimeline
    .filter((t) => t.side === "support")
    .map((t) => `${t.subject || ""}\n${t.text || ""}`);
  const otherTexts = recentTimeline
    .filter((t) => t.side !== "system")
    .map((t) => `${t.subject || ""}\n${t.text || ""}`);
  const requestBlob = ticket.requestTextPlain || "";
  const addressForm = detectReplyAddressForm(
    [...otherTexts, requestBlob],
    { ourTexts: supportTexts }
  );
  const replyLang = detectReplyLanguage(
    [...supportTexts, ...otherTexts, requestBlob].join("\n")
  );
  const vendorHintBlob = [
    ticket.briefDescription,
    ticket.productName,
    ticket.issueTypeName,
    requestBlob,
    ...recentTimeline.map((t) => `${t.subject || ""}\n${t.text || ""}`),
  ].join("\n");
  const vendorHints = detectRelevantVendorsFromTicketText(vendorHintBlob);

  const timelineText = recentTimeline
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

Relevante Hersteller/Produkte (Heuristik aus Ticket — in solutionSketch.vendors und outline/steps/artifacts berücksichtigen):
${
  vendorHints.length
    ? vendorHints.map((v) => `- ${v}`).join("\n")
    : "- (keine klaren Treffer — aus Verlauf selbst ableiten; bei B1-Themen mind. SAP Business One)"
}
SQL-Artefakte: Bei B1-Firmen-DB-SQL IMMER beide Varianten (sql_hana + sql_sqlserver). HANA nur in korrekter HANA-Syntax.
Bei Linux/HANA-Server-Problemen zusätzlich bash-Shell und ggf. HANA-Monitoring/hdbsql liefern.

Anrede-Muster für nextReplyDraft: ${
    addressForm === "du"
      ? "per Du"
      : addressForm === "formal"
        ? "formell"
        : "unklar"
  } (Heuristik aus Verlauf; Support-Antworten stärker gewichtet)
${replyAddressFormInstruction(addressForm, replyLang)}

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

  const { client, model, provider } = getAnalysisClient({
    needsVision: images.length > 0,
  });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.25,
    // DeepSeek-Thinking (falls doch an) + lange solutionSketch brauchen Luft.
    max_tokens: 12_000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userContent },
    ],
    // Structured JSON: Thinking aus — sonst frisst Reasoning max_tokens und
    // content bleibt leer («Keine Zusammenfassung.»).
    ...(provider === "chat" ? getChatJsonRequestExtras() : {}),
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

  const finishReason = completion.choices[0]?.finish_reason;
  const raw = completion.choices[0]?.message?.content?.trim() || "";
  if (!raw) {
    throw new Error(
      finishReason === "length"
        ? "AI-Antwort abgeschnitten (Token-Limit) — bitte erneut analysieren."
        : "AI lieferte keinen Text. Bitte erneut analysieren."
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    );
  } catch {
    throw new Error(
      finishReason === "length"
        ? "AI-Antwort war unvollständiges JSON (abgeschnitten). Bitte erneut analysieren."
        : "AI-Antwort war kein gültiges JSON."
    );
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
  if (isHollowMariTicketAnalysis(result.data)) {
    throw new Error(
      finishReason === "length"
        ? "AI-Antwort war abgeschnitten (Token-Limit) — keine brauchbare Zusammenfassung. Bitte erneut analysieren."
        : "AI-Antwort war leer (keine brauchbare Zusammenfassung). Bitte erneut analysieren."
    );
  }
  return {
    ...result.data,
    imagesAnalyzed: images.length,
    imageNames,
    usage: buildAiTokenUsage(model, completion.usage),
  };
}

/** Placeholder / truncated DeepSeek JSON that looks „fertig“, aber nichts enthält. */
export function isHollowMariTicketAnalysis(
  analysis: MariTicketAnalysis
): boolean {
  const summary = analysis.summary.trim();
  const emptySummary =
    !summary ||
    summary === "Keine Zusammenfassung." ||
    summary === "Keine Zusammenfassung";
  const noSubstance =
    analysis.suggestedTasks.length === 0 &&
    analysis.suggestions.length === 0 &&
    !analysis.nextReplyDraft?.trim() &&
    !analysis.solutionSketch?.outline?.trim();
  return emptySummary && analysis.completeness.score === 0 && noSubstance;
}
