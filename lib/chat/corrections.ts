import {
  listChatCorrections,
  type ChatCorrectionRow,
} from "@/lib/db/queries";

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "einem",
  "eines",
  "und",
  "oder",
  "aber",
  "mit",
  "ohne",
  "von",
  "vom",
  "zum",
  "zur",
  "für",
  "auf",
  "aus",
  "bei",
  "nach",
  "über",
  "unter",
  "ist",
  "sind",
  "war",
  "wird",
  "werden",
  "hat",
  "haben",
  "nicht",
  "auch",
  "noch",
  "schon",
  "sehr",
  "wie",
  "was",
  "wann",
  "wo",
  "wer",
  "welche",
  "welcher",
  "welches",
  "bitte",
  "zeige",
  "zeig",
  "mir",
  "dir",
  "uns",
  "ich",
  "du",
  "wir",
  "ihr",
  "sie",
  "es",
  "im",
  "in",
  "am",
  "an",
  "zu",
  "als",
  "dass",
  "daß",
  "the",
  "and",
  "for",
  "with",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9äöüß]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function scoreCorrection(queryTokens: string[], correction: ChatCorrectionRow): number {
  if (queryTokens.length === 0) return 0;
  const hay = `${correction.topic || ""} ${correction.content}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (hay.includes(token)) score += token.length >= 5 ? 2 : 1;
  }
  return score;
}

/**
 * Pick corrections relevant to the question.
 * With few corrections, include all active ones (family use).
 */
export function retrieveCorrectionsForChat(
  question: string,
  limit = 12
): ChatCorrectionRow[] {
  const all = listChatCorrections(true);
  if (all.length === 0) return [];
  if (all.length <= 20) return all.slice(0, limit);

  const tokens = tokenize(question);
  const ranked = all
    .map((row) => ({ row, score: scoreCorrection(tokens, row) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    // Still surface recent corrections as soft context.
    return all.slice(0, Math.min(5, limit));
  }

  return ranked.slice(0, limit).map((entry) => entry.row);
}

export function formatCorrectionsForPrompt(
  corrections: ChatCorrectionRow[]
): string {
  if (corrections.length === 0) {
    return "Keine gespeicherten Nutzer-Korrekturen.";
  }

  return corrections
    .map((c, i) => {
      const topic = c.topic?.trim() ? ` (${c.topic.trim()})` : "";
      return `[Korrektur ${i + 1}] id=${c.id}${topic}\n${c.content.trim()}`;
    })
    .join("\n\n");
}
