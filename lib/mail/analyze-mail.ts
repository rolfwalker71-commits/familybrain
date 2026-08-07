import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import {
  MailAnalysisSchema,
  type MailAnalysis,
  type MailSuggestion,
} from "@/lib/mail/mail-action-schema";
import type { MailMessageDetail } from "@/lib/mail/gmail";
import { enrichMailAnalysisTitles } from "@/lib/mail/enrich-shipping-titles";
import { enrichSuggestionNotes } from "@/lib/mail/subject-notes";
import type { MailAppliedLink } from "@/lib/mail/mail-applied-links";

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
- «title» = kurzer Kalender-/Task-Titel. Enthält wenn sinnvoll Betreff-Kern, Absender und/oder Lieferant/Carrier (Versand: «UPS Paketlieferung - irugs.ch»).
- «notes» = Beschreibung mit möglichst viel sinnvollem Kontext aus dem Mail (Bausteine mit « - »):
  Carrier/Lieferant · Worüber · Teilnehmer/Empfänger · Tracking/Referenz/Bestellnr. · Vorbereitung/Agenda.
  Beispiel Versand: «UPS Paketlieferung - irugs.ch - Trackingnummer 1Z…»
  Beispiel Termin: Zusatzkontext und Stichworte (Teilnehmer, Mitbringen, Agenda) — NICHT Ort, Uhrzeit oder Dauer (die gehören in location / startTime / endTime). Tracking/Referenzen gehören in notes, nicht weglassen.
  Keine leeren Platzhalter. Nicht den rohen Mail-Betreff nur in Klammern anhängen.
- Nur vorschlagen, was wirklich speicherwürdig ist. Newsletter/Werbung → suggestions: [].
- Keine Dubletten. Keine erfundenen Daten — wenn unsicher, weglassen oder allDay/nur Datum.
- Zeiten als HH:mm (24h). Datumsangaben relativ («morgen», «Montag») in absolute YYYY-MM-DD anhand «Heute» auflösen.
- kind "event": startDate Pflicht wenn möglich. Wenn ein Zustell-/Termin-Zeitfenster im Mail steht (z.B. «zwischen 9 und 13 Uhr», «9:00 AM – 1:00 PM»), IMMER startTime und endTime als HH:mm setzen — nicht nur das Datum. location setzen wenn Adresse/Ort genannt. In notes KEINE Adresse, KEINE Uhrzeiten, KEINE Dauer wiederholen.
- Wenn im Thread-Kontext bereits ein Google-Event mit ID genannt ist und das Mail eine Änderung (neues Zeitfenster/Ort) ist: dasselbe Event aktualisieren — setze patchEventId und calendarId auf die vorhandenen Werte (kein zweites Event).
- kind "task": dueDate wenn Frist/Tag bekannt, sonst null.
- kind "note": «reference» = Tracking/Code, «notes» = kontextuelle Beschreibung wie oben.
- kind "trip": nur bei klarer Reise (Flug, Hotel, Zug, Mietwagen). tripType eines von Flug|Zugreisen|Hotel|Mietauto|Transfer|Ausflug. startDate Pflicht. bookingReference/provider wenn erkennbar. Kein paralleles Kalender-event für dieselbe Reise — trip reicht.
- kind "finance": bei Rechnung, Mahnung, Zahlungsaufforderung (auch ohne PDF). title z.B. «Rechnung Swisscom». amount/currency/vendor/dueDate wenn erkennbar. Kein paralleles event nur wegen Fälligkeit — finance reicht; optional zusätzlich task wenn Mahnung.
- replyDraft: nur wenn eine kurze Antwort an den Absender sinnvoll ist (Termin zusagen, Lieferadresse bestätigen, Rückfrage). Sonst weglassen oder null. body auf Deutsch, höflich und knapp.
- Antworte NUR als JSON-Objekt.`;

export type AnalyzeMailContext = {
  threadContext?: string | null;
  senderPrefLine?: string | null;
  patchableEvent?: MailAppliedLink | null;
};

function attachPatchHints(
  suggestions: MailSuggestion[],
  patchable: MailAppliedLink | null | undefined
): MailSuggestion[] {
  if (!patchable?.googleEventId || !patchable.calendarId) return suggestions;
  return suggestions.map((s) => {
    if (s.kind !== "event") return s;
    if (s.patchEventId) return s;
    return {
      ...s,
      patchEventId: patchable.googleEventId,
      calendarId: patchable.calendarId,
    };
  });
}

export async function analyzeMailForActions(
  message: MailMessageDetail,
  todayIso: string,
  context?: AnalyzeMailContext
): Promise<MailAnalysis> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen).");
  }

  const body = mailBodyForAi(message);
  const extraBlocks = [
    context?.senderPrefLine?.trim() || null,
    context?.threadContext?.trim() || null,
    context?.patchableEvent?.googleEventId
      ? `Bereits übernommener Termin in diesem Thread (bei Änderung patchen):\n- title: ${context.patchableEvent.title}\n- patchEventId: ${context.patchableEvent.googleEventId}\n- calendarId: ${context.patchableEvent.calendarId}\n- start: ${context.patchableEvent.startDate || "—"} ${context.patchableEvent.startTime || ""}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const userPrompt = `Heute (Europe/Zurich): ${todayIso}

Von: ${message.fromName} <${message.from}>
Betreff: ${message.subject}
Datum-Header: ${message.date || "—"}
${extraBlocks ? `\n${extraBlocks}\n` : ""}
Inhalt:
${body || "(leer)"}

JSON-Schema:
{
  "summary": "1 Satz worum es geht",
  "relevance": "none"|"low"|"medium"|"high",
  "replyDraft": { "subject": "Re: …"|null, "body": "kurze Antwort DE", "tone": "kurz"|null }|null,
  "suggestions": [
    {
      "kind": "event"|"task"|"note"|"trip"|"finance",
      "title": "z.B. UPS Paketlieferung - irugs.ch oder LX80 ZRH-LHR oder Rechnung Swisscom",
      "notes": "Kontext …",
      "reference": "Tracking/Code oder null",
      "tripType": "Flug|Hotel|Zugreisen|… oder null",
      "provider": "Airline/Hotel oder null",
      "bookingReference": "PNR oder null",
      "amount": 49.90|null,
      "currency": "CHF"|null,
      "vendor": "Swisscom"|null,
      "reason": "warum speichern",
      "confidence": 0.0-1.0,
      "startDate": "YYYY-MM-DD"|null,
      "startTime": "HH:mm"|null,
      "endDate": "YYYY-MM-DD"|null,
      "endTime": "HH:mm"|null,
      "allDay": false,
      "location": "string"|null,
      "dueDate": "YYYY-MM-DD"|null,
      "patchEventId": "googleEventId oder null",
      "calendarId": "calendarId bei patch oder null"
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
    if (s.kind === "trip") return Boolean(s.startDate && s.title.trim());
    if (s.kind === "finance") {
      return Boolean(
        s.title.trim() && (s.amount != null || s.vendor?.trim() || s.dueDate)
      );
    }
    if (s.kind === "note") {
      return Boolean(s.title.trim() && (s.reference?.trim() || s.notes?.trim()));
    }
    return Boolean(s.title.trim());
  });

  const withPatch = attachPatchHints(suggestions, context?.patchableEvent);

  const { matchFamilyMemberFromMail } = await import("@/lib/google/people");
  const memberMatch = matchFamilyMemberFromMail({
    fromName: message.fromName,
    fromEmail: message.from,
    subject: message.subject,
    snippet: message.snippet,
    body,
  });

  const { matchOpenInvoiceFromMail } = await import(
    "@/lib/mail/match-finance"
  );
  const withFinance = withPatch.map((s) => {
    if (s.kind !== "finance") return s;
    const match = matchOpenInvoiceFromMail({
      vendor: s.vendor || message.fromName || null,
      amount: s.amount ?? null,
      currency: s.currency ?? null,
    });
    if (!match) return s;
    return {
      ...s,
      documentId: match.documentId,
      vendor: s.vendor || match.vendor,
      amount: s.amount ?? match.amount,
      currency: s.currency || match.currency,
      dueDate: s.dueDate || match.dueDate,
      notes: [
        s.notes?.trim() || null,
        match.title
          ? `Treffer offene Rechnung: ${match.title} (#${match.documentId})`
          : `Treffer Dokument #${match.documentId}`,
      ]
        .filter(Boolean)
        .join("\n"),
      reason:
        s.reason ||
        `Passt zu offener Rechnung (${Math.round(match.score * 100)} %)`,
    };
  });

  const analysis: MailAnalysis = {
    ...result.data,
    suggestions: withFinance,
    replyDraft: result.data.replyDraft?.body?.trim()
      ? result.data.replyDraft
      : null,
    suggestedMember: memberMatch
      ? {
          memberId: memberMatch.memberId,
          displayName: memberMatch.displayName,
        }
      : null,
  };

  const enriched = enrichMailAnalysisTitles(analysis, {
    from: message.from,
    fromName: message.fromName,
    subject: message.subject,
    body,
  });

  const ctx = {
    from: message.from,
    fromName: message.fromName,
    subject: message.subject,
    body,
  };

  return {
    ...enriched,
    replyDraft: analysis.replyDraft,
    suggestedMember: analysis.suggestedMember,
    suggestions: enriched.suggestions.map((s) =>
      enrichSuggestionNotes(s, ctx)
    ),
  };
}
