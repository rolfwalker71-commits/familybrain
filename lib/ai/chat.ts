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
- Nenne am Ende kurz die wichtigsten Quelldokumente (Markdown-Liste).`;

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
Wenn die Frage ein bestimmtes Schiff/Produkt nennt: nimm die dazu passenden Dokumente und den Reiseverlauf dort – ignoriere andere Kreuzfahrten als Antwort.`,
      },
    ],
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() ||
    "Ich konnte keine Antwort erzeugen.";

  let sources = retrieval.sources;
  if (sources.length === 0 && retrieval.facts.length > 0) {
    const seen = new Set<number>();
    sources = [];
    for (const f of retrieval.facts) {
      if (!f.documentId || seen.has(f.documentId)) continue;
      seen.add(f.documentId);
      sources.push({
        id: f.documentId,
        paperlessId: 0,
        title: f.documentTitle,
        category: null,
        shortSummary: f.details,
        correspondent: null,
        createdDate: null,
        excerpt: f.details,
        score: f.score,
      });
      if (sources.length >= 8) break;
    }
  }

  return { answer, sources };
}
