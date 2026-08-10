import { z } from "zod";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import {
  getChatClient,
  getChatModel,
  hasChatKey,
} from "@/lib/ai/client";
import {
  normalizeReplySubject,
  detectReplyAddressForm,
  replyAddressFormInstruction,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";
import { applySwissOrthography } from "@/lib/microsoft/analyze-mail-day";

export type { ReplyLang };
export {
  detectReplyLanguage,
  detectReplyAddressForm,
  normalizeReplySubject,
  replyAddressFormInstruction,
} from "@/lib/microsoft/reply-language-shared";

const TranslateSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(4000),
  language: z.enum(["de", "en"]),
});

export async function translateMailReply(input: {
  subject: string;
  body: string;
  targetLang: ReplyLang;
}): Promise<{
  subject: string;
  body: string;
  language: ReplyLang;
  usage: AiTokenUsage | null;
}> {
  if (!hasChatKey()) {
    throw new Error("Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API).");
  }
  const target = input.targetLang;
  const addressForm = detectReplyAddressForm(
    `${input.subject}\n${input.body}`
  );
  const addressHint = replyAddressFormInstruction(addressForm, target);
  const client = getChatClient();
  const model = getChatModel();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          target === "en"
            ? `You translate business e-mail reply drafts into clear, professional English.
Keep facts, names, dates and numbers. Keep the same address form (informal vs formal) as the source — never switch Du↔Sie / Hi↔Dear Mr.
${addressHint}
Subject must use "Re:" (not AW:). Return JSON only: {"subject","body","language":"en"}.`
            : `Du übersetzt geschäftliche Mail-Antwortentwürfe in klares, professionelles Schweizer Hochdeutsch.
Kein scharfes s (ß) — immer ss (Gruss, heissen, Strasse).
Fakten, Namen, Daten und Zahlen bleiben. Anrede-Form (Du vs. formell) exakt beibehalten — nie mischen oder wechseln.
${addressHint}
Betreff mit «AW:» (nicht Re:). Nur JSON: {"subject","body","language":"de"}.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          subject: input.subject,
          body: input.body,
          targetLanguage: target,
          addressForm,
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
    throw new Error("Übersetzung lieferte kein gültiges JSON.");
  }
  const data = TranslateSchema.parse(parsed);
  const language = data.language === "en" ? "en" : "de";
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
