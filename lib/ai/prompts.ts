import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";

const categoriesList = KNOWLEDGE_AREAS.map((a) => a.name).join(", ");

export const ANALYSIS_SYSTEM_PROMPT = `You are an assistant that extracts structured household knowledge from OCR text of personal documents (Swiss family context).

Rules:
- Analyze ONLY the provided OCR text and metadata.
- Do NOT invent missing values. Use null if unknown.
- Prefer ISO dates yyyy-mm-dd for all date fields.
- Extract CHF amounts carefully.
- Identify whether the document is Rechnung, Vertrag, Versicherung, Garantie, Reiseunterlage, Arztbericht, Steuerdokument or Sonstiges.
- Return VALID JSON only. No markdown. No commentary.
- Category must be one of: ${categoriesList}`;

export function buildAnalysisUserPrompt(input: {
  title: string | null;
  correspondent: string | null;
  documentType: string | null;
  createdDate: string | null;
  tags: string[];
  content: string | null;
}): string {
  const content = (input.content ?? "").slice(0, 24000);
  return `Analyze this Paperless document and return JSON matching the required schema.

Metadata:
- Title: ${input.title ?? "null"}
- Correspondent: ${input.correspondent ?? "null"}
- Document type: ${input.documentType ?? "null"}
- Created date: ${input.createdDate ?? "null"}
- Tags: ${input.tags.length ? input.tags.join(", ") : "none"}

OCR content:
"""
${content}
"""

Required JSON shape:
{
  "category": "Versicherungen",
  "short_summary": "...",
  "detailed_summary": "...",
  "important_points": ["..."],
  "important_dates": [{"date": "2026-09-30", "label": "...", "description": "..."}],
  "amounts": [{"amount": 365.4, "currency": "CHF", "label": "..."}],
  "deadlines": [{"title": "...", "date": "2026-09-30", "type": "cancellation", "description": "..."}],
  "contract_parties": [{"name": "...", "role": "..."}],
  "warranty_info": {
    "has_warranty": false,
    "product_name": null,
    "manufacturer": null,
    "vendor": null,
    "purchase_date": null,
    "warranty_until": null,
    "serial_number": null,
    "price": null,
    "currency": null,
    "warranty_months": null
  },
  "cancellation_terms": {
    "has_cancellation_terms": false,
    "notice_period": null,
    "latest_cancellation_date": null
  },
  "possible_todos": [{"title": "...", "due_date": null, "priority": "normal"}],
  "financial_items": [{
    "vendor": null,
    "amount": null,
    "currency": "CHF",
    "invoice_date": null,
    "due_date": null,
    "category": null,
    "is_recurring": false,
    "description": null
  }],
  "travel_items": [{
    "travel_type": null,
    "provider": null,
    "title": null,
    "start_date": null,
    "end_date": null,
    "origin": null,
    "destination": null,
    "booking_reference": null,
    "price": null,
    "currency": null
  }],
  "confidence": 0.8
}`;
}

export function buildRepairPrompt(invalidJson: string, validationError: string): string {
  return `The previous JSON failed validation.

Validation error:
${validationError}

Invalid JSON:
${invalidJson}

Return corrected VALID JSON only, matching the required schema. No markdown.`;
}
