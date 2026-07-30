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

export async function analyzeDocument(
  documentId: number,
  options?: {
    expectedContentHash?: string | null;
    manageErrorStatus?: boolean;
  }
): Promise<AnalyzeResult> {
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

    saveAnalysis(
      documentId,
      parsed.data,
      model,
      options?.expectedContentHash
    );
    try {
      const { applyTriageAfterAnalysis, TRIAGE_REASON_LABELS } = await import(
        "@/lib/documents/triage"
      );
      const triage = applyTriageAfterAnalysis(documentId, parsed.data);
      if (triage.queued) {
        const { notifyDocumentTriageQueued } = await import(
          "@/lib/realtime/notify"
        );
        notifyDocumentTriageQueued(
          documentId,
          triage.reasons.map((r) => TRIAGE_REASON_LABELS[r])
        );
      }
    } catch (triageErr) {
      console.error(
        "[analyze] document triage failed",
        documentId,
        triageErr instanceof Error ? triageErr.message : triageErr
      );
    }
    try {
      const { notifyAnalysisCompleted } = await import("@/lib/realtime/notify");
      notifyAnalysisCompleted(documentId, {
        category: parsed.data.category,
        short_summary: parsed.data.short_summary,
      });
    } catch {
      /* ignore notify failures */
    }
    try {
      const { writebackAnalysisToPaperless } = await import(
        "@/lib/paperless/writeback"
      );
      await writebackAnalysisToPaperless(documentId);
    } catch (wbErr) {
      console.error(
        "[analyze] paperless writeback failed",
        documentId,
        wbErr instanceof Error ? wbErr.message : wbErr
      );
    }
    try {
      const { ensureDocumentAiIconIfMissing } = await import(
        "@/lib/paperless/document-icon"
      );
      await ensureDocumentAiIconIfMissing(documentId);
    } catch (iconErr) {
      console.error(
        "[analyze] document ai icon failed",
        documentId,
        iconErr instanceof Error ? iconErr.message : iconErr
      );
    }
    return { documentId, analysis: parsed.data, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options?.manageErrorStatus !== false) {
      markAnalysisError(documentId, message);
    }
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
