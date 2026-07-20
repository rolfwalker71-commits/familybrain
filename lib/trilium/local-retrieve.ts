import {
  countSyncedTriliumNotes,
  getTriliumScopeLabel,
  listSyncedTriliumNotesForSearch,
} from "@/lib/db/queries";
import type { TriliumNoteSource } from "./chat-retrieve";
import { buildSearchStrategies, tokenizeQuestionForSearch } from "./search-query";

function scoreText(text: string, tokens: string[]): { score: number; hits: number } {
  if (!text || tokens.length === 0) return { score: 0, hits: 0 };
  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    if (text.includes(token)) {
      hits += 1;
      score += token.length >= 6 ? 3 : 2;
    }
  }
  return { score, hits };
}

function excerptFromContent(content: string, maxLength = 2500): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}…`;
}

export function hasLocalTriliumIndex(): boolean {
  return countSyncedTriliumNotes() > 0;
}

export function retrieveLocalTriliumForChat(
  question: string,
  limit = 5
): TriliumNoteSource[] {
  const notes = listSyncedTriliumNotesForSearch();
  if (notes.length === 0) return [];

  const tokens = tokenizeQuestionForSearch(question);
  const phraseCandidates = buildSearchStrategies(question)
    .map((strategy) => strategy.replace(/^note\.title \*=\* '(.+)'$/, "$1"))
    .map((strategy) => strategy.replace(/^"|"$/g, ""))
    .filter((value) => value.length > 2);

  const scored = notes
    .map((note) => {
      const title = (note.title || "").toLowerCase();
      const content = (note.content_text || "").toLowerCase();
      const blob = `${title}\n${content}`;

      let score = 0;
      let hits = 0;

      if (tokens.length === 0) {
        score = 0.5;
        hits = 0;
      } else {
        const titleScore = scoreText(title, tokens);
        const contentScore = scoreText(content, tokens);
        score =
          titleScore.score * 4 +
          contentScore.score * 2 +
          (note.is_protected ? 0 : 0.5);
        hits = titleScore.hits + contentScore.hits;

        for (const phrase of phraseCandidates) {
          const normalized = phrase.toLowerCase();
          if (title.includes(normalized)) score += 40;
          else if (content.includes(normalized)) score += 20;
        }
      }

      if (tokens.length > 0 && hits === 0) score = 0;

      return { note, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored
    .map(({ note, score }) => {
      const content = note.content_text?.trim() || "";
      const excerpt =
        content.length > 0
          ? excerptFromContent(content)
          : note.title?.trim() || "";
      if (!excerpt) return null;

      return {
        kind: "trilium" as const,
        noteId: note.note_id,
        title: note.title || "Ohne Titel",
        scopeLabel: getTriliumScopeLabel(note.scope),
        excerpt,
        url: note.trilium_url || "",
        score,
      };
    })
    .filter((note): note is TriliumNoteSource => Boolean(note));
}
