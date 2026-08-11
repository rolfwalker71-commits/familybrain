import { z } from "zod";
import {
  getDeepSeekMailClient,
  getDeepSeekMailJsonExtras,
  getDeepSeekMailModel,
  hasDeepSeekMailKey,
} from "@/lib/ai/client";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import { applySwissOrthography } from "@/lib/microsoft/analyze-mail-day";
import {
  detectReplyAddressForm,
  detectReplyLanguage,
  normalizeReplySubject,
  replyAddressFormInstruction,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";
import { getMicrosoftMessage } from "@/lib/microsoft/mail-inbox";

export type MailComposeAiAction =
  | "suggest"
  | "shorter"
  | "formal"
  | "toDe"
  | "toEn";

const DraftSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(8000),
  language: z.enum(["de", "en"]).optional(),
});

export type MailComposeAiResult = {
  subject: string;
  body: string;
  language: ReplyLang;
  usage: AiTokenUsage | null;
};

async function runMailComposeChat(input: {
  system: string;
  user: Record<string, unknown>;
  temperature?: number;
}): Promise<MailComposeAiResult> {
  if (!hasDeepSeekMailKey()) {
    throw new Error(
      "DeepSeek-Key fehlt für Mail-AI. Unter Einstellungen → KI-API hinterlegen."
    );
  }
  const client = getDeepSeekMailClient();
  const model = getDeepSeekMailModel();
  const completion = await client.chat.completions.create({
    model,
    temperature: input.temperature ?? 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: JSON.stringify(input.user) },
    ],
    ...getDeepSeekMailJsonExtras(),
  });
  const usage = buildAiTokenUsage(model, completion.usage);
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Mail-AI lieferte kein gültiges JSON.");
  }
  const data = DraftSchema.parse(parsed);
  const language: ReplyLang =
    data.language === "en" || data.language === "de"
      ? data.language
      : detectReplyLanguage(`${data.subject}\n${data.body}`);
  const subjectRaw = normalizeReplySubject(data.subject, language);
  const bodyRaw = data.body.trim();
  return {
    subject:
      language === "de" ? applySwissOrthography(subjectRaw) : subjectRaw,
    body: language === "de" ? applySwissOrthography(bodyRaw) : bodyRaw,
    language,
    usage,
  };
}

/** Suggest a reply (or new mail) draft via DeepSeek. */
export async function suggestMailComposeDraft(input: {
  userId: number;
  mode: "new" | "reply";
  sourceMailId?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  hint?: string | null;
}): Promise<MailComposeAiResult> {
  let sourceSubject = input.subject?.trim() || "";
  let sourceFrom = "";
  let sourceBody = "";
  if (input.sourceMailId?.trim()) {
    try {
      const msg = await getMicrosoftMessage(input.userId, input.sourceMailId);
      sourceSubject = sourceSubject || msg.subject || "";
      sourceFrom = msg.fromName || msg.from || "";
      sourceBody = (msg.bodyText || msg.snippet || "").slice(0, 5000);
    } catch {
      /* optional context */
    }
  }

  const blob = [sourceSubject, sourceBody, input.body || ""].join("\n");
  const lang = detectReplyLanguage(blob) || "de";
  const addressForm = detectReplyAddressForm(blob);
  const addressHint = replyAddressFormInstruction(addressForm, lang);

  if (input.mode === "reply" || input.sourceMailId) {
    return runMailComposeChat({
      system:
        lang === "en"
          ? `You write a concise professional reply email for a Swiss business context.
Keep facts from the source mail. Match address form (informal vs formal).
${addressHint}
Do not invent commitments you cannot verify. No markdown. Return JSON: {"subject","body","language":"en"}.
Subject should use "Re:" when replying.`
          : `Du schreibst eine knappe, professionelle Geschäftsantwort (Schweizer Hochdeutsch, kein ß — immer ss).
Fakten aus der Quellmail beibehalten. Anrede-Form (Du/Sie) passend zum Absender.
${addressHint}
Keine erfundenen Zusagen. Kein Markdown. Nur JSON: {"subject","body","language":"de"}.
Betreff mit «AW:» bei Antworten.`,
      user: {
        mode: "reply",
        to: input.to || null,
        from: sourceFrom || null,
        sourceSubject: sourceSubject || null,
        sourceBody: sourceBody || null,
        currentDraft: input.body?.trim() || null,
        hint: input.hint?.trim() || null,
      },
    });
  }

  return runMailComposeChat({
    system:
      lang === "en"
        ? `You draft a short professional outbound business email.
${addressHint}
No markdown. Return JSON: {"subject","body","language":"en"}.`
        : `Du entwirfst eine kurze professionelle Geschäftsmail (Schweizer Hochdeutsch, kein ß).
${addressHint}
Kein Markdown. Nur JSON: {"subject","body","language":"de"}.`,
    user: {
      mode: "new",
      to: input.to || null,
      subject: input.subject || null,
      currentDraft: input.body?.trim() || null,
      hint: input.hint?.trim() || null,
    },
  });
}

/** Rewrite an existing draft (shorter / more formal / language). */
export async function rewriteMailComposeDraft(input: {
  action: Exclude<MailComposeAiAction, "suggest">;
  subject: string;
  body: string;
}): Promise<MailComposeAiResult> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!body) throw new Error("Kein Text zum Umschreiben.");

  const addressForm = detectReplyAddressForm(`${subject}\n${body}`);
  const currentLang = detectReplyLanguage(`${subject}\n${body}`);

  if (input.action === "toDe" || input.action === "toEn") {
    const target: ReplyLang = input.action === "toEn" ? "en" : "de";
    const addressHint = replyAddressFormInstruction(addressForm, target);
    return runMailComposeChat({
      temperature: 0.2,
      system:
        target === "en"
          ? `Translate/rewrite this business email into clear professional English.
Keep facts. Keep address form. ${addressHint}
Subject: use "Re:" if it is a reply. JSON: {"subject","body","language":"en"}.`
          : `Übersetze/formuliere diese Geschäftsmail in klares Schweizer Hochdeutsch (kein ß).
Fakten und Anrede-Form beibehalten. ${addressHint}
Betreff: «AW:» bei Antworten. JSON: {"subject","body","language":"de"}.`,
      user: { subject, body, targetLanguage: target, addressForm },
    });
  }

  const targetLang = currentLang === "en" ? "en" : "de";
  const addressHint = replyAddressFormInstruction(addressForm, targetLang);
  const goal =
    input.action === "shorter"
      ? targetLang === "en"
        ? "Make it shorter and clearer; keep meaning and politeness."
        : "Kürze den Text klar und höflich; Inhalt bleibt."
      : targetLang === "en"
        ? "Make the tone more formal/professional without changing meaning."
        : "Formuliere formeller/professioneller, ohne den Inhalt zu ändern.";

  return runMailComposeChat({
    temperature: 0.25,
    system:
      targetLang === "en"
        ? `You rewrite business email drafts. Goal: ${goal}
${addressHint}
No markdown. JSON: {"subject","body","language":"en"}.`
        : `Du überarbeitest Geschäftsmail-Entwürfe (Schweizer Hochdeutsch, kein ß). Ziel: ${goal}
${addressHint}
Kein Markdown. JSON: {"subject","body","language":"de"}.`,
    user: { subject, body, action: input.action, addressForm },
  });
}
