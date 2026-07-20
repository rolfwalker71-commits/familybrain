import { getTriliumSettings } from "@/lib/db/queries";
import type { TriliumClient } from "./client";
import { TriliumClient as TriliumClientClass } from "./client";
import { htmlToPlainText } from "./html-to-text";
import {
  TRILIUM_SCOPE_GESCHAEFTLICH_TITLE,
  TRILIUM_SCOPE_PRIVAT_TITLE,
} from "./constants";

export type TriliumNoteSource = {
  kind: "trilium";
  noteId: string;
  title: string;
  scopeLabel: string;
  excerpt: string;
  url: string;
  score: number;
};

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "ein",
  "eine",
  "ist",
  "sind",
  "was",
  "wie",
  "wo",
  "wann",
  "welche",
  "welcher",
  "welches",
  "habe",
  "haben",
  "hat",
  "für",
  "von",
  "mit",
  "auf",
  "im",
  "in",
  "zu",
  "am",
  "an",
  "den",
  "dem",
  "des",
  "mir",
  "mich",
  "meine",
  "mein",
  "uns",
  "unser",
  "zeige",
  "zeig",
  "gib",
  "bitte",
]);

function buildSearchQuery(question: string): string | null {
  const tokens = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

  if (tokens.length === 0) return null;
  return tokens.slice(0, 8).join(" ");
}

function createClient(): TriliumClient | null {
  const settings = getTriliumSettings();
  if (!settings.baseUrl || !settings.apiToken) return null;
  if (!settings.privatNoteId || !settings.geschaeftlichNoteId) return null;
  return new TriliumClientClass(settings.baseUrl, settings.apiToken);
}

export async function retrieveTriliumForChat(
  question: string,
  limit = 5
): Promise<TriliumNoteSource[]> {
  const client = createClient();
  if (!client) return [];

  const settings = getTriliumSettings();
  const search = buildSearchQuery(question);
  if (!search) return [];

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

  const hits = new Map<
    string,
    TriliumNoteSource & { noteId: string }
  >();

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

  const ranked = [...hits.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  for (const note of ranked) {
    try {
      const html = await client.getNoteContent(note.noteId);
      note.excerpt = htmlToPlainText(html, 2500);
    } catch {
      note.excerpt = "";
    }
  }

  return ranked.filter((note) => note.excerpt.trim().length > 0);
}
