import { z } from "zod";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import { getChatClient, getChatModel, hasChatKey } from "@/lib/ai/client";
import type { MariTicketAnalysis } from "@/lib/mari/analyze-ticket";
import type { MariTicketDetail } from "@/lib/mari/tickets";
import { timelineSideLabel } from "@/lib/mari/timeline-side";
import { applySwissOrthography } from "@/lib/microsoft/analyze-mail-day";
import {
  detectReplyAddressForm,
  detectReplyLanguage,
  replyAddressFormInstruction,
} from "@/lib/microsoft/reply-language-shared";

const DraftSchema = z.object({
  text: z.string().min(1).max(4000),
});

/**
 * Kurzer kunden-sichtbarer Kommentar: Eingang bestätigen, ggf. fehlende
 * Details ansprechen, baldige Bearbeitung zusagen. Mail macht Maringo.
 */
export async function draftMariExternalComment(params: {
  ticket: MariTicketDetail;
  analysis?: MariTicketAnalysis | null;
}): Promise<{ text: string; usage: AiTokenUsage | null }> {
  if (!hasChatKey()) {
    throw new Error("Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API).");
  }

  const ticket = params.ticket;
  const analysis = params.analysis ?? null;
  const recent = (ticket.timeline || []).slice(-20);
  const supportTexts = recent
    .filter((t) => t.side === "support")
    .map((t) => `${t.subject || ""}\n${t.text || ""}`);
  const otherTexts = recent
    .filter((t) => t.side !== "system")
    .map((t) => `${t.subject || ""}\n${t.text || ""}`);
  const requestBlob = ticket.requestTextPlain || "";
  const addressForm = detectReplyAddressForm([...otherTexts, requestBlob], {
    ourTexts: supportTexts,
  });
  const lang = detectReplyLanguage(
    [...supportTexts, ...otherTexts, requestBlob].join("\n")
  );
  const addressHint = replyAddressFormInstruction(addressForm, lang);

  const missing =
    analysis?.completeness?.missing?.filter((m) => m.trim()).slice(0, 6) || [];
  const completenessNotes = analysis?.completeness?.notes?.trim() || "";
  const summary = analysis?.summary?.trim() || "";

  const timelineBrief = recent
    .map((t) => {
      const side = timelineSideLabel(t.side || "unknown");
      return `[${side}] ${t.text.slice(0, 280)}`;
    })
    .join("\n")
    .slice(0, 3500);

  const client = getChatClient();
  const model = getChatModel();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          lang === "en"
            ? `You write a short customer-facing support ticket comment (not an internal note).
Goals:
1) Acknowledge the request briefly.
2) If important details may still be missing, ask for them politely (use provided missing list when present; otherwise only if clearly needed from context).
3) Reassure that we will take care of it as soon as possible.
Keep it concise (about 4–8 sentences). No markdown, no bullet lists unless 2–4 short asks.
Do not invent ticket IDs, SLAs, or promises you cannot keep.
${addressHint}
Return JSON only: {"text":"..."}.`
            : `Du schreibst einen kurzen kunden-sichtbaren Support-Kommentar (kein interner Vermerk).
Ziele:
1) Anfrage kurz bestätigen / Eingang quittieren.
2) Falls wichtige Details fehlen könnten: höflich nachfragen (Liste «missing» nutzen wenn vorhanden; sonst nur wenn aus dem Kontext klar).
3) Zusichern, dass wir uns baldmöglichst darum kümmern.
Knapp halten (ca. 4–8 Sätze). Kein Markdown, keine Aufzählungen ausser 2–4 kurze Nachfragen.
Keine erfundenen Ticket-IDs, SLAs oder leeren Versprechen.
Schweizer Hochdeutsch, kein ß (ss).
${addressHint}
Nur JSON: {"text":"..."}.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          language: lang,
          addressForm,
          issueId: ticket.issueId,
          subject: ticket.briefDescription,
          customer: ticket.addressMatchcode || ticket.cardCode,
          contact: ticket.contactPerson,
          requestExcerpt: requestBlob.slice(0, 1200),
          analysisSummary: summary || null,
          missingDetails: missing.length ? missing : null,
          completenessNotes: completenessNotes || null,
          timelineBrief: timelineBrief || null,
        }),
      },
    ],
  });

  const usage = buildAiTokenUsage(model, completion.usage);
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI-Entwurf lieferte kein gültiges JSON.");
  }
  const data = DraftSchema.parse(parsed);
  let text = data.text.trim();
  if (lang === "de") text = applySwissOrthography(text);
  return { text: text.slice(0, 4000), usage };
}
