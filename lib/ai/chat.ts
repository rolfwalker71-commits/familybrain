import { currentYear, toSwissDate } from "@/lib/utils/dates";
import { retrieveTriliumForChat } from "@/lib/trilium/chat-retrieve";
import type { TriliumNoteSource } from "@/lib/trilium/chat-retrieve";
import {
  countIndexedKnowledgeGuides,
  countIndexedTriliumNotes,
  countSyncedTriliumNotes,
} from "@/lib/db/queries";
import { retrieveGuidesForChat } from "@/lib/vectors/retrieve";
import type { GuideSource } from "@/lib/vectors/types";
import {
  formatCorrectionsForPrompt,
  retrieveCorrectionsForChat,
} from "@/lib/chat/corrections";
import {
  describeChatSources,
  normalizeChatSources,
  type ChatSourceSelection,
} from "@/lib/chat/sources";
import { getOpenAIClient, getOpenAIModel } from "./client";
import {
  retrieveForChat,
  type ChatRetrieval,
  type ChatSource,
} from "./chat-retrieve";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatAnswer = {
  answer: string;
  sources: ChatSource[];
  noteSources: TriliumNoteSource[];
  guideSources: GuideSource[];
};

const EMPTY_RETRIEVAL: ChatRetrieval = {
  sources: [],
  facts: [],
  corpus: {
    totalDocuments: 0,
    analyzedDocuments: 0,
    warranties: 0,
    deadlines: 0,
    financialItems: 0,
    travelItems: 0,
  },
};

function buildSystemPrompt(
  todayIso: string,
  year: number,
  sources: ChatSourceSelection
): string {
  const todaySwiss = toSwissDate(todayIso);
  const knowledgeParts: string[] = [];
  if (sources.paperless) {
    knowledgeParts.push(
      "synchronisierte Paperless-Dokumente mit AI-Analysen (Belege, Verträge, Rechnungen, Reisen, Garantien, Fristen)"
    );
  }
  if (sources.trilium) {
    knowledgeParts.push(
      "Trilium-Notizen aus den Bereichen «Privat» und «Geschäftlich ANG» (manuelle Wissensbasis, How-tos, Homelab, Kundeninfos)"
    );
  }
  if (sources.guides) {
    knowledgeParts.push(
      "importierte PDF-Guides (Handbücher, Anleitungen, umfangreiche Referenzdokumente)"
    );
  }

  return `Du bist FamilyBrain, ein Assistent für die ausgewählte Wissensbasis einer Familie.

Aktive Quellen für diese Antwort: ${describeChatSources(sources)}.
Die Wissensbasis umfasst in dieser Anfrage:
${knowledgeParts.map((part, i) => `${i + 1}. ${part}`).join("\n")}

Kalenderkontext (verbindlich):
- Heute ist ${todaySwiss} (ISO ${todayIso}).
- Das aktuelle Kalenderjahr ist ${year}.
- «dieses Jahr», «aktuelles Jahr», «heuer» meinen immer ${year} – niemals ein anderes Jahr.
- «nächstes Jahr» meint ${year + 1}; «letztes Jahr» meint ${year - 1}.
- «heute», «demnächst», «kommend», «geplant» beziehen sich auf Daten ab ${todaySwiss}. Vergangene Reisen/Fristen nur nennen, wenn die Frage ausdrücklich danach fragt oder nichts Aktuelles vorhanden ist.

Regeln:
- Antworte auf Deutsch, klar und konkret.
- Nutze NUR die bereitgestellten aktiven Quellen plus gespeicherte Nutzer-Korrekturen. Ignoriere deaktivierte Quellen.
- GESPEICHERTE NUTZER-KORREKTUREN haben bei Widerspruch IMMER Vorrang vor Dokumenten, OCR, Fakten, Notizen und Guides.
- Wenn eine Korrektur einen Termin, ein Schiff, eine Buchung oder ein Datum korrigiert, verwende die Korrektur – nicht die ältere Dokumentangabe.
- Unterscheide klar zwischen Belegen (Dokumente), manuellen Notizen (Trilium) und importierten Guides (PDF-Handbücher).
- OCR-Auszüge und Abschnitte «Reiseverlauf / Ports of Call» können Tabellen und Tageshäfen enthalten – lies diese sorgfältig aus und zitiere sie.
- Wenn die Frage ein konkretes Schiff, Produkt oder eine Buchungsnummer nennt, beantworte NUR mit Daten zu genau diesem Objekt.
- Strukturelle Fakten können unvollständig sein. Bei Widerspruch: zuerst Korrekturen, danach Dokumentkontexte (OCR / Reiseverlauf) vor Kurzfassungen.
- Beträge, Daten, Produktnamen und Fristen nur nennen, wenn sie in den Daten oder Korrekturen stehen.
- Wenn etwas fehlt, sage ehrlich, dass es in der aktuellen Basis nicht gefunden wurde.
- Erfinde nichts.
- Formatiere Antworten als Markdown.
- Schreibe alle Datumsangaben im Schweizer Format **dd.mm.yyyy**.
- Schreibe KEINEN sichtbaren Abschnitt «Quellen» in die Antwort.
- Hänge als letzte Zeilen exakt diese Marker an:
  [[SOURCE_IDS:1354,42]]
  [[NOTE_IDS:abc123,def456]]
  [[GUIDE_IDS:7,12]]
- In SOURCE_IDS höchstens 4 Dokument-IDs, nur wenn die Antwort direkt daraus belegt ist${sources.paperless ? "" : " (Paperless ist deaktiviert → immer leer)"}.
- In NOTE_IDS höchstens 4 Trilium-Notiz-IDs, nur wenn die Antwort direkt daraus belegt ist${sources.trilium ? "" : " (Trilium ist deaktiviert → immer leer)"}.
- In GUIDE_IDS höchstens 4 Guide-IDs, nur wenn die Antwort direkt daraus belegt ist${sources.guides ? "" : " (Guides sind deaktiviert → immer leer)"}.
- Wenn nichts direkt belegt ist: [[SOURCE_IDS:]], [[NOTE_IDS:]] und/oder [[GUIDE_IDS:]].`;
}

const SOURCE_IDS_MARKER = /\[\[SOURCE_IDS:\s*([0-9,\s]*)\]\]/i;
const NOTE_IDS_MARKER = /\[\[NOTE_IDS:\s*([a-zA-Z0-9_,\s]*)\]\]/i;
const GUIDE_IDS_MARKER = /\[\[GUIDE_IDS:\s*([0-9,\s]*)\]\]/i;
const TRAILING_SOURCE_SECTION =
  /\n+(?:#{1,6}\s*)?(?:\*\*)?Quellen(?:\*\*)?:?\s*\n[\s\S]*$/i;

export function parseChatAnswerSources(rawAnswer: string): {
  answer: string;
  sourceIds: number[];
  noteIds: string[];
  guideIds: number[];
} {
  const trimmed = rawAnswer.trim();
  const sourceMarker = trimmed.match(SOURCE_IDS_MARKER);
  const noteMarker = trimmed.match(NOTE_IDS_MARKER);
  const guideMarker = trimmed.match(GUIDE_IDS_MARKER);

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

  const guideIds = guideMarker
    ? [
        ...new Set(
          guideMarker[1]
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value > 0)
        ),
      ].slice(0, 4)
    : [];

  let answer = trimmed
    .replace(SOURCE_IDS_MARKER, "")
    .replace(NOTE_IDS_MARKER, "")
    .replace(GUIDE_IDS_MARKER, "")
    .trim();
  answer = answer.replace(TRAILING_SOURCE_SECTION, "").trim();

  return { answer, sourceIds, noteIds, guideIds };
}

export async function answerDocumentChat(
  question: string,
  history: ChatMessage[] = [],
  sourceSelection?: Partial<ChatSourceSelection> | null
): Promise<ChatAnswer> {
  const sourcesEnabled = normalizeChatSources(sourceSelection);
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = currentYear();
  const retrieval = sourcesEnabled.paperless
    ? retrieveForChat(question, 12)
    : EMPTY_RETRIEVAL;
  const triliumNotes = sourcesEnabled.trilium
    ? await retrieveTriliumForChat(question, 5)
    : [];
  const guideSources = sourcesEnabled.guides
    ? await retrieveGuidesForChat(question, 6)
    : [];
  const corrections = retrieveCorrectionsForChat(question, 12);
  const triliumSynced = countSyncedTriliumNotes();
  const triliumEmbedded = countIndexedTriliumNotes();
  const guidesIndexed = countIndexedKnowledgeGuides();

  const corpusBlock = `Aktive Quellen: ${describeChatSources(sourcesEnabled)}
Gesamte lokale Basis:
- Heute: ${toSwissDate(todayIso)} · aktuelles Jahr: ${year}
- Paperless aktiv: ${sourcesEnabled.paperless ? "ja" : "nein"}
- Dokumente synchronisiert: ${retrieval.corpus.totalDocuments}
- Davon analysiert: ${retrieval.corpus.analyzedDocuments}
- Garantien/Geräte: ${retrieval.corpus.warranties}
- Fristen: ${retrieval.corpus.deadlines}
- Finanzpositionen: ${retrieval.corpus.financialItems}
- Reise-Einträge: ${retrieval.corpus.travelItems}
- Trilium aktiv: ${sourcesEnabled.trilium ? "ja" : "nein"}
- Trilium-Notizen synchronisiert: ${triliumSynced}
- Trilium-Notizen vektorindexiert: ${triliumEmbedded}
- Trilium-Notizen (Treffer zur Frage): ${triliumNotes.length}
- Guides aktiv: ${sourcesEnabled.guides ? "ja" : "nein"}
- PDF-Guides indexiert: ${guidesIndexed}
- Guide-Treffer (semantisch): ${guideSources.length}
- Gespeicherte Nutzer-Korrekturen: ${corrections.length}`;

  const correctionBlocks = formatCorrectionsForPrompt(corrections);

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

  const guideBlocks =
    guideSources.length === 0
      ? "Keine passenden Guide-Auszüge gefunden."
      : guideSources
          .map((guide, i) => {
            const pageInfo =
              guide.pageStart != null
                ? `Seite ${guide.pageStart}${guide.pageEnd && guide.pageEnd !== guide.pageStart ? `–${guide.pageEnd}` : ""}`
                : "–";
            return `[Guide ${i + 1}] guideId=${guide.id} score=${guide.score.toFixed(2)}
Titel: ${guide.title}
Seite: ${pageInfo}
Inhalt:
${guide.excerpt}`;
          })
          .join("\n\n---\n\n");

  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: buildSystemPrompt(todayIso, year, sourcesEnabled) },
      ...history.slice(-6).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user",
        content: `Frage: ${question}

${corpusBlock}

GESPEICHERTE NUTZER-KORREKTUREN (haben Vorrang bei Widersprüchen):
${correctionBlocks}

STRUKTURIERTE FAKTEN AUS DER GESAMTEN BASIS:
${factBlocks}

RELEVANTE DOKUMENTE AUS DER GESAMTEN BASIS:
${contextBlocks}

RELEVANTE TRILIUM-NOTIZEN (Master → Privat / Geschäftlich ANG):
${triliumBlocks}

RELEVANTE GUIDE-AUSZÜGE (importierte PDF-Handbücher, semantische Suche):
${guideBlocks}

Beantworte die Frage jetzt anhand der gesamten Wissensbasis.
Beachte den Kalenderkontext: «dieses Jahr» = ${year}, «kommend/geplant» ab ${toSwissDate(todayIso)}.
Wenn Korrekturen vorliegen und Dokumente widersprechen, folge den Korrekturen.

Wichtig für Quellen:
- Gib keinen sichtbaren Quellenabschnitt aus.
- Markiere am Ende nur die Dokument-, Notiz- und Guide-IDs, die deine Antwort unmittelbar belegen.
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

  const guideCandidates = new Map(
    guideSources.map((guide) => [guide.id, guide])
  );
  const citedGuideSources = parsed.guideIds
    .map((id) => guideCandidates.get(id))
    .filter((guide): guide is GuideSource => Boolean(guide));

  return {
    answer: parsed.answer,
    sources,
    noteSources,
    guideSources: citedGuideSources,
  };
}
