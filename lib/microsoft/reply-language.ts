import { z } from "zod";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import {
  getOpenAIClient,
  getOpenAIModel,
  hasOpenAIKey,
} from "@/lib/ai/client";
import {
  normalizeReplySubject,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";
import { applySwissOrthography } from "@/lib/microsoft/analyze-mail-day";

export type { ReplyLang };
export {
  detectReplyLanguage,
  normalizeReplySubject,
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
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt (Einstellungen).");
  }
  const target = input.targetLang;
  const client = getOpenAIClient();
  const model = getOpenAIModel();
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
Keep facts, names, dates and numbers. Use an appropriate greeting and closing.
Subject must use "Re:" (not AW:). Return JSON only: {"subject","body","language":"en"}.`
            : `Du übersetzt geschäftliche Mail-Antwortentwürfe in klares, professionelles Schweizer Hochdeutsch.
Kein scharfes s (ß) — immer ss (Gruss, heissen, Strasse). Schlussformel z. B. «Freundliche Grüsse».
Fakten, Namen, Daten und Zahlen bleiben. Passende Anrede und Schlussformel.
Betreff mit «AW:» (nicht Re:). Nur JSON: {"subject","body","language":"de"}.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          subject: input.subject,
          body: input.body,
          targetLanguage: target,
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
