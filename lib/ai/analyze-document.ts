import { getOpenAIClient, getOpenAIModel } from "./client";
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
  buildRepairPrompt,
} from "./prompts";
import { tryParseAnalysisJson } from "./parse-analysis";
import { getDocumentById } from "@/lib/db/queries";
import { markAnalysisError, saveAnalysis } from "@/lib/extraction/save-analysis";
import type { DocumentAnalysis } from "./schemas";

export type AnalyzeResult = {
  documentId: number;
  analysis: DocumentAnalysis;
  model: string;
};

export async function analyzeDocument(documentId: number): Promise<AnalyzeResult> {
  const detail = getDocumentById(documentId);
  if (!detail) {
    throw new Error(`Dokument ${documentId} nicht gefunden.`);
  }

  const { document, tags } = detail;
  const model = getOpenAIModel();
  const client = getOpenAIClient();

  const userPrompt = buildAnalysisUserPrompt({
    title: document.title,
    correspondent: document.correspondent_name,
    documentType: document.document_type_name,
    createdDate: document.created_date,
    tags: tags.map((t) => t.tag_name).filter(Boolean) as string[],
    content: document.content,
  });

  try {
    const first = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = first.choices[0]?.message?.content ?? "";
    let parsed = tryParseAnalysisJson(raw);

    if (!parsed.success) {
      const repair = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
          { role: "assistant", content: raw },
          {
            role: "user",
            content: buildRepairPrompt(parsed.raw, parsed.error),
          },
        ],
      });
      const repairedRaw = repair.choices[0]?.message?.content ?? "";
      parsed = tryParseAnalysisJson(repairedRaw);
      if (!parsed.success) {
        throw new Error(`AI JSON validation failed: ${parsed.error}`);
      }
    }

    saveAnalysis(documentId, parsed.data, model);
    return { documentId, analysis: parsed.data, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markAnalysisError(documentId, message);
    throw error;
  }
}

export async function analyzePendingBatch(limit = 10): Promise<{
  processed: number;
  succeeded: number;
  failed: { documentId: number; error: string }[];
}> {
  const { listPendingDocumentIds } = await import("@/lib/db/queries");
  const ids = listPendingDocumentIds(limit);
  const failed: { documentId: number; error: string }[] = [];
  let succeeded = 0;

  for (const id of ids) {
    try {
      await analyzeDocument(id);
      succeeded += 1;
    } catch (error) {
      failed.push({
        documentId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed: ids.length, succeeded, failed };
}
