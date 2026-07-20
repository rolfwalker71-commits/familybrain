import { getTriliumSettings } from "@/lib/db/queries";
import type { TriliumClient } from "./client";
import { TriliumClient as TriliumClientClass } from "./client";
import { htmlToPlainText } from "./html-to-text";
import {
  TRILIUM_SCOPE_GESCHAEFTLICH_TITLE,
  TRILIUM_SCOPE_PRIVAT_TITLE,
} from "./constants";
import {
  hasLocalTriliumIndex,
  retrieveLocalTriliumForChat,
} from "./local-retrieve";
import { buildSearchStrategies } from "./search-query";

export type TriliumNoteSource = {
  kind: "trilium";
  noteId: string;
  title: string;
  scopeLabel: string;
  excerpt: string;
  url: string;
  score: number;
};

export { buildSearchStrategies } from "./search-query";

function createClient(): TriliumClient | null {
  const settings = getTriliumSettings();
  if (!settings.baseUrl || !settings.apiToken) return null;
  if (!settings.privatNoteId || !settings.geschaeftlichNoteId) return null;
  return new TriliumClientClass(settings.baseUrl, settings.apiToken);
}

async function searchLiveTriliumForChat(
  question: string,
  limit: number
): Promise<TriliumNoteSource[]> {
  const client = createClient();
  if (!client) return [];

  const settings = getTriliumSettings();
  const strategies = buildSearchStrategies(question);
  if (strategies.length === 0) return [];

  const scopes = [
    {
      noteId: settings.privatNoteId!,
      label: TRILIUM_SCOPE_PRIVAT_TITLE,
    },
    {
      noteId: settings.geschaeftlichNoteId!,
      label: TRILIUM_SCOPE_GESCHAEFTLICH_TITLE,
    },
  ];

  const hits = new Map<string, TriliumNoteSource>();

  for (const search of strategies) {
    hits.clear();
    for (const scope of scopes) {
      const response = await client.searchNotes(search, {
        ancestorNoteId: scope.noteId,
        limit: Math.max(limit, 6),
        fastSearch: false,
      });

      response.results.forEach((note, index) => {
        const score = Math.max(1, 10 - index);
        const existing = hits.get(note.noteId);
        if (!existing || existing.score < score) {
          hits.set(note.noteId, {
            kind: "trilium",
            noteId: note.noteId,
            title: note.title || "Ohne Titel",
            scopeLabel: scope.label,
            excerpt: "",
            url: client.noteUrl(note.noteId),
            score,
          });
        }
      });
    }
    if (hits.size > 0) break;
  }

  const ranked = [...hits.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  for (const note of ranked) {
    try {
      const html = await client.getNoteContent(note.noteId);
      note.excerpt = htmlToPlainText(html, 2500);
    } catch {
      note.excerpt = note.title || "";
    }
  }

  return ranked.filter(
    (note) => note.excerpt.trim().length > 0 || note.title.trim().length > 0
  );
}

export async function retrieveTriliumForChat(
  question: string,
  limit = 5
): Promise<TriliumNoteSource[]> {
  if (hasLocalTriliumIndex()) {
    const local = retrieveLocalTriliumForChat(question, limit);
    if (local.length > 0) return local;
  }

  return searchLiveTriliumForChat(question, limit);
}
