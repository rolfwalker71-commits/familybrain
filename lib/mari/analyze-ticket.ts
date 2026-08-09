import { z } from "zod";
import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import type { MariTicketDetail } from "@/lib/mari/tickets";

export const MariTicketAnalysisSchema = z.object({
  summary: z.string().max(800),
  completeness: z.object({
    score: z.number().min(0).max(100),
    missing: z.array(z.string().max(200)).max(10),
    notes: z.string().max(500).optional(),
  }),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().max(200),
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
Analysiere das Ticket inkl. Verlauf und liefere:
1) summary — knappe, saubere Zusammenfassung des Falls und des aktuellen Stands
2) completeness — Vollständigkeit 0–100, fehlende Infos (missing[]), kurze notes
3) suggestedTasks — konkrete nächste Arbeitsschritte für den Supporter
4) suggestions — Handlungsempfehlungen (Status, Nachfassen, Eskalation, …)
5) recommendedStatus — optional Status-Empfehlung (IDs: 11 NEU, 1 Offen, 3 In Arbeit, 6 Warte auf Kunden, 7 Warte auf Hersteller, 14 Eskalation, 2 Gelöst)
6) nextReplyDraft — optional kurze Kundenantwort auf Deutsch, sonst null

Keine erfundenen Fakten. Antworte NUR als JSON-Objekt.`;

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
  const result = MariTicketAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("AI-Antwort entsprach nicht dem Schema.");
  }
  return result.data;
}
