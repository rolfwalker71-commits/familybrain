import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import {
  MailAnalysisSchema,
  type MailAnalysis,
} from "@/lib/mail/mail-action-schema";
import type { MailMessageDetail } from "@/lib/mail/gmail";

function htmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function mailBodyForAi(message: MailMessageDetail): string {
  const raw =
    message.bodyText?.trim() ||
    (message.bodyHtml ? htmlToPlain(message.bodyHtml) : "") ||
    message.snippet ||
    "";
  return raw.slice(0, 12_000);
}

const SYSTEM = `Du bist Buddy, ein Haushalt-Assistent in der Schweiz (Zeitzone Europe/Zurich, Datumformat YYYY-MM-DD).
Analysiere E-Mails und erkenne, ob daraus Kalendertermine, Aufgaben und/oder Notizen entstehen sollten.

WICHTIG:
- Ein Mail kann MEHRERE Vorschläge brauchen. Typisches UPS-Beispiel:
  1) kind "event" — Zustellfenster im Kalender
  2) kind "task" — «Paket annehmen»
  3) kind "note" — Tracking-Nummer / Referenz zur Ablage
- Nur vorschlagen, was wirklich speicherwürdig ist. Newsletter/Werbung → suggestions: [].
- Keine Dubletten. Keine erfundenen Daten — wenn unsicher, weglassen oder allDay/nur Datum.
- Zeiten als HH:mm (24h). Datumsangaben relativ («morgen», «Montag») in absolute YYYY-MM-DD anhand «Heute» auflösen.
- kind "event": startDate Pflicht wenn möglich; startTime wenn Zeitfenster/Uhrzeit bekannt; endTime wenn Ende bekannt.
- kind "task": dueDate wenn Frist/Tag bekannt, sonst null.
- kind "note": für Tracking-Nummern, Buchungs-/Referenzcodes, IBAN-Hinweise o.ä. — «reference» = der Code selbst, «notes» = kurzer Kontext, «title» z.B. «UPS Tracking».
- Antworte NUR als JSON-Objekt.`;

export async function analyzeMailForActions(
  message: MailMessageDetail,
  todayIso: string
): Promise<MailAnalysis> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen).");
  }

  const body = mailBodyForAi(message);
  const userPrompt = `Heute (Europe/Zurich): ${todayIso}

Von: ${message.fromName} <${message.from}>
Betreff: ${message.subject}
Datum-Header: ${message.date || "—"}

Inhalt:
${body || "(leer)"}

JSON-Schema:
{
  "summary": "1 Satz worum es geht",
  "relevance": "none"|"low"|"medium"|"high",
  "suggestions": [
    {
      "kind": "event"|"task"|"note",
      "title": "kurz",
      "notes": "Kontext oder null",
      "reference": "Tracking/Code oder null (vor allem bei note)",
      "reason": "warum speichern",
      "confidence": 0.0-1.0,
      "startDate": "YYYY-MM-DD"|null,
      "startTime": "HH:mm"|null,
      "endDate": "YYYY-MM-DD"|null,
      "endTime": "HH:mm"|null,
      "allDay": false,
      "location": "string"|null,
      "dueDate": "YYYY-MM-DD"|null
    }
  ]
}`;

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

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI-Antwort war kein gültiges JSON.");
  }

  const result = MailAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI-Schema ungültig: ${result.error.message}`);
  }

  const suggestions = result.data.suggestions.filter((s) => {
    if (s.kind === "event") return Boolean(s.startDate);
    if (s.kind === "note") {
      return Boolean(s.title.trim() && (s.reference?.trim() || s.notes?.trim()));
    }
    return Boolean(s.title.trim());
  });

  return {
    ...result.data,
    suggestions,
  };
}
