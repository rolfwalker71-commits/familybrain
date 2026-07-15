import { DocumentAnalysisSchema, type DocumentAnalysis } from "./schemas";

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseAnalysisJson(raw: string): DocumentAnalysis {
  const cleaned = stripMarkdownFences(raw);
  const parsed = JSON.parse(cleaned);
  return DocumentAnalysisSchema.parse(parsed);
}

export function tryParseAnalysisJson(raw: string): {
  success: true;
  data: DocumentAnalysis;
} | {
  success: false;
  error: string;
  raw: string;
} {
  try {
    return { success: true, data: parseAnalysisJson(raw) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      raw,
    };
  }
}
