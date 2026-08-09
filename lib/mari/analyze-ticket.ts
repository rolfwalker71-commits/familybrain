import { z } from "zod";
import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
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
  };
}

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
});

export type MariTicketAnalysis = z.infer<typeof MariTicketAnalysisSchema>;

const SYSTEM = `Du bist Buddy, Assistent für Maringo/MARI Support-Tickets (Schweiz, de-CH).
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
  "nextReplyDraft": "Kundenantwort DE oder null"
}

Status-IDs: 11 NEU, 1 Offen, 3 In Arbeit, 6 Warte auf Kunden, 7 Warte auf Hersteller, 14 Eskalation, 2 Gelöst.
Keine erfundenen Fakten. score als Zahl. Arrays nie weglassen (leer ok). Antworte NUR als JSON-Objekt.`;

export async function analyzeMariTicket(
  ticket: MariTicketDetail
): Promise<MariTicketAnalysis> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen → OpenAI).");
  }

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
Priorität: ${ticket.priorityName}
Kunde: ${ticket.cardCode || "–"}
Fällig: ${ticket.dueDate || "–"}
Zuständig: ${ticket.responsible || "–"}

Anfragetext:
${ticket.requestTextPlain.slice(0, 6000)}

Verlauf (chronologisch):
${timelineText.slice(0, 14000) || "(keine Positionen)"}`;

  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt },
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
  return result.data;
}
