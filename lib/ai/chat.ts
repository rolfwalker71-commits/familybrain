import { currentYear, toSwissDate } from "@/lib/utils/dates";
import { retrieveTriliumForChat } from "@/lib/trilium/chat-retrieve";
import type { TriliumNoteSource } from "@/lib/trilium/chat-retrieve";
import { getOpenAIClient, getOpenAIModel } from "./client";
import { retrieveForChat, type ChatSource } from "./chat-retrieve";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatAnswer = {
  answer: string;
  sources: ChatSource[];
  noteSources: TriliumNoteSource[];
};

function buildSystemPrompt(todayIso: string, year: number): string {
  const todaySwiss = toSwissDate(todayIso);
  return `Du bist FamilyBrain, ein Assistent für die gesamte Wissensbasis einer Familie.

Die Wissensbasis umfasst:
1. synchronisierte Paperless-Dokumente mit AI-Analysen (Belege, Verträge, Rechnungen, Reisen, Garantien, Fristen)
2. Trilium-Notizen aus den Bereichen «Privat» und «Geschäftlich ANG» (manuelle Wissensbasis, How-tos, Homelab, Kundeninfos)

Kalenderkontext (verbindlich):
- Heute ist ${todaySwiss} (ISO ${todayIso}).
- Das aktuelle Kalenderjahr ist ${year}.
- «dieses Jahr», «aktuelles Jahr», «heuer» meinen immer ${year} – niemals ein anderes Jahr.
- «nächstes Jahr» meint ${year + 1}; «letztes Jahr» meint ${year - 1}.
- «heute», «demnächst», «kommend», «geplant» beziehen sich auf Daten ab ${todaySwiss}. Vergangene Reisen/Fristen nur nennen, wenn die Frage ausdrücklich danach fragt oder nichts Aktuelles vorhanden ist.

Regeln:
- Antworte auf Deutsch, klar und konkret.
- Nutze die gesamte bereitgestellte Basis (Korpus-Statistik, strukturierte Fakten, Dokumentkontexte UND Trilium-Notizen).
- Unterscheide klar zwischen Belegen (Dokumente) und manuellen Notizen (Trilium).
- OCR-Auszüge und Abschnitte «Reiseverlauf / Ports of Call» können Tabellen und Tageshäfen enthalten – lies diese sorgfältig aus und zitiere sie.
- Wenn die Frage ein konkretes Schiff, Produkt oder eine Buchungsnummer nennt, beantworte NUR mit Daten zu genau diesem Objekt.
- Strukturelle Fakten können unvollständig sein. Bei Widerspruch haben die Dokumentkontexte (OCR / Reiseverlauf) Vorrang vor Kurzfassungen.
- Beträge, Daten, Produktnamen und Fristen nur nennen, wenn sie in den Daten stehen.
- Wenn etwas fehlt, sage ehrlich, dass es in der aktuellen Basis nicht gefunden wurde.
- Erfinde nichts.
- Formatiere Antworten als Markdown.
- Schreibe alle Datumsangaben im Schweizer Format **dd.mm.yyyy**.
- Schreibe KEINEN sichtbaren Abschnitt «Quellen» in die Antwort.
- Hänge als letzte Zeilen exakt diese Marker an:
  [[SOURCE_IDS:1354,42]]
  [[NOTE_IDS:abc123,def456]]
- In SOURCE_IDS höchstens 4 Dokument-IDs, nur wenn die Antwort direkt daraus belegt ist.
- In NOTE_IDS höchstens 4 Trilium-Notiz-IDs, nur wenn die Antwort direkt daraus belegt ist.
- Wenn nichts direkt belegt ist: [[SOURCE_IDS:]] und/oder [[NOTE_IDS:]].`;
}

const SOURCE_IDS_MARKER = /\[\[SOURCE_IDS:\s*([0-9,\s]*)\]\]/i;
const NOTE_IDS_MARKER = /\[\[NOTE_IDS:\s*([a-zA-Z0-9_,\s]*)\]\]/i;
const TRAILING_SOURCE_SECTION =
  /\n+(?:#{1,6}\s*)?(?:\*\*)?Quellen(?:\*\*)?:?\s*\n[\s\S]*$/i;

export function parseChatAnswerSources(rawAnswer: string): {
  answer: string;
  sourceIds: number[];
  noteIds: string[];
} {
  const trimmed = rawAnswer.trim();
  const sourceMarker = trimmed.match(SOURCE_IDS_MARKER);
  const noteMarker = trimmed.match(NOTE_IDS_MARKER);

  const sourceIds = sourceMarker
    ? [
        ...new Set(
          sourceMarker[1]
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value > 0)
        ),
      ].slice(0, 4)
    : [];

  const noteIds = noteMarker
    ? [
        ...new Set(
          noteMarker[1]
            .split(",")
            .map((value) => value.trim())
            .filter((value) => /^[a-zA-Z0-9_]{4,32}$/.test(value))
        ),
      ].slice(0, 4)
    : [];

  let answer = trimmed
    .replace(SOURCE_IDS_MARKER, "")
    .replace(NOTE_IDS_MARKER, "")
    .trim();
  answer = answer.replace(TRAILING_SOURCE_SECTION, "").trim();

  return { answer, sourceIds, noteIds };
}

export async function answerDocumentChat(
  question: string,
  history: ChatMessage[] = []
): Promise<ChatAnswer> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = currentYear();
  const retrieval = retrieveForChat(question, 12);
  const triliumNotes = await retrieveTriliumForChat(question, 5);

  const corpusBlock = `Gesamte lokale Basis:
- Heute: ${toSwissDate(todayIso)} · aktuelles Jahr: ${year}
- Dokumente synchronisiert: ${retrieval.corpus.totalDocuments}
- Davon analysiert: ${retrieval.corpus.analyzedDocuments}
- Garantien/Geräte: ${retrieval.corpus.warranties}
- Fristen: ${retrieval.corpus.deadlines}
- Finanzpositionen: ${retrieval.corpus.financialItems}
- Reise-Einträge: ${retrieval.corpus.travelItems}
- Trilium-Notizen (Privat/Geschäftlich): ${triliumNotes.length} Treffer`;

  const factBlocks =
    retrieval.facts.length === 0
      ? "Keine besonders passenden strukturierten Extrakte zur Frage."
      : retrieval.facts
          .map(
            (f, i) =>
              `[Fakt ${i + 1}] (${f.kind}, score=${f.score}) ${f.label}
${f.details}
Quelle: ${f.documentTitle || "–"} (Dokument-ID ${f.documentId ?? "–"})`
          )
          .join("\n\n");

  const contextBlocks =
    retrieval.sources.length === 0
      ? "Keine passenden Dokumente in der Gesamtdatenbank gefunden."
      : retrieval.sources
          .map(
            (s, i) =>
              `[Dokument ${i + 1}] id=${s.id} score=${s.score.toFixed(1)}
Titel: ${s.title || "Ohne Titel"}
Korrespondent: ${s.correspondent || "–"}
Kategorie: ${s.category || "–"}
Datum: ${toSwissDate(s.createdDate)}
Inhalt:
${s.excerpt}`
          )
          .join("\n\n---\n\n");

  const triliumBlocks =
    triliumNotes.length === 0
      ? "Keine passenden Trilium-Notizen gefunden."
      : triliumNotes
          .map(
            (note, i) =>
              `[Notiz ${i + 1}] noteId=${note.noteId} score=${note.score.toFixed(1)}
Titel: ${note.title}
Bereich: ${note.scopeLabel}
Inhalt:
${note.excerpt}`
          )
          .join("\n\n---\n\n");

  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: buildSystemPrompt(todayIso, year) },
      ...history.slice(-6).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user",
        content: `Frage: ${question}

${corpusBlock}

STRUKTURIERTE FAKTEN AUS DER GESAMTEN BASIS:
${factBlocks}

RELEVANTE DOKUMENTE AUS DER GESAMTEN BASIS:
${contextBlocks}

RELEVANTE TRILIUM-NOTIZEN (Master → Privat / Geschäftlich ANG):
${triliumBlocks}

Beantworte die Frage jetzt anhand der gesamten Wissensbasis.
Beachte den Kalenderkontext: «dieses Jahr» = ${year}, «kommend/geplant» ab ${toSwissDate(todayIso)}.

Wichtig für Quellen:
- Gib keinen sichtbaren Quellenabschnitt aus.
- Markiere am Ende nur die Dokument-IDs und Notiz-IDs, die deine Antwort unmittelbar belegen.
- Gib niemals alle Retrieval-Treffer als Quellen an.`,
      },
    ],
  });

  const rawAnswer =
    completion.choices[0]?.message?.content?.trim() ||
    "Ich konnte keine Antwort erzeugen.";
  const parsed = parseChatAnswerSources(rawAnswer);

  const sourceCandidates = new Map<number, ChatSource>(
    retrieval.sources.map((source) => [source.id, source])
  );
  for (const fact of retrieval.facts) {
    if (!fact.documentId || sourceCandidates.has(fact.documentId)) continue;
    sourceCandidates.set(fact.documentId, {
      id: fact.documentId,
      paperlessId: 0,
      title: fact.documentTitle,
      category: null,
      shortSummary: fact.details,
      correspondent: null,
      createdDate: null,
      excerpt: fact.details,
      score: fact.score,
    });
  }

  const sources = parsed.sourceIds
    .map((id) => sourceCandidates.get(id))
    .filter((source): source is ChatSource => Boolean(source));

  const noteCandidates = new Map(
    triliumNotes.map((note) => [note.noteId, note])
  );
  const noteSources = parsed.noteIds
    .map((id) => noteCandidates.get(id))
    .filter((note): note is TriliumNoteSource => Boolean(note));

  return { answer: parsed.answer, sources, noteSources };
}
