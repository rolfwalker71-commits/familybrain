import { toSwissDate } from "@/lib/utils/dates";
import { getOpenAIClient, getOpenAIModel } from "./client";
import { retrieveForChat, type ChatSource } from "./chat-retrieve";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatAnswer = {
  answer: string;
  sources: ChatSource[];
};

const SYSTEM_PROMPT = `Du bist FamilyBrain, ein Assistent für die gesamte lokale Dokumentenbasis einer Familie (Paperless-Sync + AI-Analysen).

Die Wissensbasis umfasst ALLE synchronisierten Dokumente und Extrakte – über alle Kategorien hinweg (Gesundheit, Versicherungen, Wohnen, Steuern, Finanzen, Reisen, Geräte & Garantien, Verträge usw.).

Regeln:
- Antworte auf Deutsch, klar und konkret.
- Nutze die gesamte bereitgestellte Basis (Korpus-Statistik, strukturierte Fakten UND Dokumentkontexte).
- OCR-Auszüge und Abschnitte «Reiseverlauf / Ports of Call» können Tabellen und Tageshäfen enthalten – lies diese sorgfältig aus und zitiere sie.
- Wenn die Frage ein konkretes Schiff, Produkt oder eine Buchungsnummer nennt, beantworte NUR mit Daten zu genau diesem Objekt. Erwähne andere Reisen/Schiffe nur, wenn sie explizit gemeint sind – nicht als Ersatzantwort.
- Strukturelle Fakten können unvollständig oder zu einem anderen Objekt gehören. Bei Widerspruch haben die Dokumentkontexte (OCR / Reiseverlauf) Vorrang.
- Beschränke dich NICHT künstlich auf eine Kategorie, wenn die Daten aus mehreren Bereichen relevant sind.
- Beträge, Daten, Produktnamen und Fristen nur nennen, wenn sie in den Daten stehen.
- Wenn etwas fehlt, sage ehrlich, dass es in der aktuellen Basis nicht gefunden wurde.
- Erfinde nichts.
- Formatiere Antworten als Markdown: **fett** für Totale/Kernaussagen, *kursiv* sparsam für Hinweise, Aufzählungen mit -, Tabellen mit | wenn mehrere Beträge/Daten/Positionen sinnvoll sind.
- Schreibe alle Datumsangaben im Schweizer Format **dd.mm.yyyy** (z. B. 06.06.2026). Nie yyyy-mm-dd oder amerikanisch.
- Schreibe KEINEN sichtbaren Abschnitt «Quellen» in die Antwort.
- Hänge als allerletzte Zeile exakt einen maschinenlesbaren Marker an:
  [[SOURCE_IDS:1354,42]]
- In diesen Marker gehören höchstens 4 Dokument-IDs und NUR Dokumente, deren Inhalt die konkrete Antwort direkt belegt. Ähnliche Treffer, allgemeiner Kontext oder Dokumente, die nicht in der Antwort verwendet wurden, gehören nicht hinein.
- Wenn kein Dokument die Antwort direkt belegt, verwende [[SOURCE_IDS:]].`;

const SOURCE_IDS_MARKER = /\[\[SOURCE_IDS:\s*([0-9,\s]*)\]\]\s*$/i;
const TRAILING_SOURCE_SECTION =
  /\n+(?:#{1,6}\s*)?(?:\*\*)?Quellen(?:\*\*)?:?\s*\n[\s\S]*$/i;

/**
 * The model marks only documents it actually used. Keep this metadata out of
 * the visible answer and discard broad retrieval candidates.
 */
export function parseChatAnswerSources(rawAnswer: string): {
  answer: string;
  sourceIds: number[];
} {
  const trimmed = rawAnswer.trim();
  const marker = trimmed.match(SOURCE_IDS_MARKER);
  const sourceIds = marker
    ? [
        ...new Set(
          marker[1]
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value > 0)
        ),
      ].slice(0, 4)
    : [];

  let answer = marker
    ? trimmed.slice(0, marker.index).trim()
    : trimmed;
  // Defensive cleanup for models that still add the old visible source list.
  answer = answer.replace(TRAILING_SOURCE_SECTION, "").trim();

  return { answer, sourceIds };
}

export async function answerDocumentChat(
  question: string,
  history: ChatMessage[] = []
): Promise<ChatAnswer> {
  const retrieval = retrieveForChat(question, 12);

  const corpusBlock = `Gesamte lokale Basis:
- Dokumente synchronisiert: ${retrieval.corpus.totalDocuments}
- Davon analysiert: ${retrieval.corpus.analyzedDocuments}
- Garantien/Geräte: ${retrieval.corpus.warranties}
- Fristen: ${retrieval.corpus.deadlines}
- Finanzpositionen: ${retrieval.corpus.financialItems}
- Reise-Einträge: ${retrieval.corpus.travelItems}`;

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

  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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

Beantworte die Frage jetzt anhand der gesamten lokalen Wissensbasis.
Wenn die Frage ein bestimmtes Schiff/Produkt nennt: nimm die dazu passenden Dokumente und den Reiseverlauf dort – ignoriere andere Kreuzfahrten als Antwort.

Wichtig für Quellen:
- Gib keinen sichtbaren Quellenabschnitt aus.
- Markiere am Ende nur die Dokument-IDs, die deine Antwort unmittelbar belegen.
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

  return { answer: parsed.answer, sources };
}
