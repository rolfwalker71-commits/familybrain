import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import {
  MailAnalysisSchema,
  type MailAnalysis,
} from "@/lib/mail/mail-action-schema";
import type { MailMessageDetail } from "@/lib/mail/gmail";
import { enrichMailAnalysisTitles } from "@/lib/mail/enrich-shipping-titles";
import { appendMailSubjectToNotes } from "@/lib/mail/subject-notes";

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
- Ein Mail kann MEHRERE Vorschläge brauchen. Typisches UPS/DHL-Beispiel:
  1) kind "event" — Titel MUSS Carrier + Shop enthalten, z.B. «UPS Paketlieferung - irugs.ch» (nicht nur «Paketlieferung»)
  2) kind "task" — z.B. «Paket annehmen (UPS · irugs.ch)»
  3) kind "note" — Tracking-Nummer; title z.B. «UPS Tracking - irugs.ch», reference = Tracking-Code
- Carrier (UPS, DHL, Die Post, …) und Lieferant/Shop (Domain oder Markenname aus dem Mail) immer in den Titeln, wenn erkennbar.
- Nur vorschlagen, was wirklich speicherwürdig ist. Newsletter/Werbung → suggestions: [].
- Keine Dubletten. Keine erfundenen Daten — wenn unsicher, weglassen oder allDay/nur Datum.
- Zeiten als HH:mm (24h). Datumsangaben relativ («morgen», «Montag») in absolute YYYY-MM-DD anhand «Heute» auflösen.
- kind "event": startDate Pflicht wenn möglich. Wenn ein Zustell-/Termin-Zeitfenster im Mail steht (z.B. «zwischen 9 und 13 Uhr», «9:00 AM – 1:00 PM»), IMMER startTime und endTime als HH:mm setzen — nicht nur das Datum.
- kind "task": dueDate wenn Frist/Tag bekannt, sonst null.
- kind "note": «reference» = Tracking/Code, «notes» = kurzer Kontext.
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
      "title": "z.B. UPS Paketlieferung - irugs.ch",
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

  const analysis: MailAnalysis = {
    ...result.data,
    suggestions,
  };

  const enriched = enrichMailAnalysisTitles(analysis, {
    from: message.from,
    fromName: message.fromName,
    subject: message.subject,
    body,
  });

  return {
    ...enriched,
    suggestions: enriched.suggestions.map((s) => ({
      ...s,
      notes: appendMailSubjectToNotes(s.notes, message.subject),
    })),
  };
}
