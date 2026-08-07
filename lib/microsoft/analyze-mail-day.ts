import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import { z } from "zod";

export const MsDayTaskSuggestionSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sourceMailId: z.string().max(200).nullable().optional(),
  sourceSubject: z.string().max(300).nullable().optional(),
  folder: z.enum(["inbox", "sent"]).nullable().optional(),
  reason: z.string().max(400).optional(),
});

export const MsDayMailAnalysisSchema = z.object({
  daySummary: z.string().max(1200),
  highlights: z.array(z.string().max(300)).max(8),
  openLoops: z.array(z.string().max(300)).max(8),
  tasks: z.array(MsDayTaskSuggestionSchema).max(12),
});

export type MsDayTaskSuggestion = z.infer<typeof MsDayTaskSuggestionSchema>;
export type MsDayMailAnalysis = z.infer<typeof MsDayMailAnalysisSchema>;

function packMailsForPrompt(mails: MsMailItem[], cap: number): string {
  return mails
    .slice(0, cap)
    .map((m, i) => {
      const body = (m.bodyText || m.preview || "").slice(0, 900);
      return `[#${i + 1}|${m.folder}|id=${m.id}]
Von: ${m.from}${m.fromEmail ? ` <${m.fromEmail}>` : ""}
An: ${m.toPreview || "—"}
Betreff: ${m.subject}
Zeit: ${m.receivedOrSentAt || "—"}
Text:
${body || "(leer)"}`;
    })
    .join("\n\n---\n\n");
}

/** AI day digest from inbox + sent (facts only from provided mails). */
export async function analyzeMicrosoftMailDay(input: {
  todayIso: string;
  inbox: MsMailItem[];
  sent: MsMailItem[];
}): Promise<MsDayMailAnalysis> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen).");
  }

  const packed = [
    `=== POSTEINGANG (${input.inbox.length}) ===`,
    packMailsForPrompt(input.inbox, 20),
    `=== GESENDET (${input.sent.length}) ===`,
    packMailsForPrompt(input.sent, 12),
  ].join("\n\n");

  const system = `Du bist Buddy, Haushalt-/Büro-Assistent (Schweiz, Deutsch, Europe/Zurich).
Analysiere die Mails des Tages (Posteingang + Gesendet) als Gesamtbild.
- daySummary: 3–6 Sätze, was passiert ist und was offen bleibt.
- highlights: kurze Stichpunkte (wichtige Zusagen, Termine, Lieferungen).
- openLoops: was noch Antwort/Handlung braucht.
- tasks: konkrete Aufgaben die DU ableiten kannst (Titel handlungsnah). dueDate nur wenn klar. sourceMailId = id aus dem Prompt.
Keine erfundenen Fakten. Newsletter/Werbung ignorieren. Antworte NUR als JSON.`;

  const user = `Heute: ${input.todayIso}

${packed || "(keine Mails)"}

JSON-Schema:
{
  "daySummary": "…",
  "highlights": ["…"],
  "openLoops": ["…"],
  "tasks": [
    {
      "title": "…",
      "notes": "…"|null,
      "dueDate": "YYYY-MM-DD"|null,
      "sourceMailId": "id"|null,
      "sourceSubject": "Betreff"|null,
      "folder": "inbox"|"sent"|null,
      "reason": "…"
    }
  ]
}`;

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: getOpenAIModel(),
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI-Antwort war kein gültiges JSON.");
  }
  const result = MsDayMailAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI-Schema ungültig: ${result.error.message}`);
  }

  const idSet = new Set(
    [...input.inbox, ...input.sent].map((m) => m.id)
  );
  return {
    ...result.data,
    tasks: result.data.tasks
      .filter((t) => t.title.trim())
      .map((t) => ({
        ...t,
        sourceMailId:
          t.sourceMailId && idSet.has(t.sourceMailId) ? t.sourceMailId : null,
      })),
  };
}
