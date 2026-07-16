import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";
import { selectAnalysisOcrWindow } from "@/lib/extraction/itinerary";
import {
  DEADLINE_TYPES,
  FINANCE_BUCKETS,
  TRAVEL_TYPES,
} from "@/lib/extraction/normalize-categories";

const categoriesList = KNOWLEDGE_AREAS.map((a) => a.name).join(", ");
const travelTypesList = TRAVEL_TYPES.join(", ");
const deadlineTypesList = DEADLINE_TYPES.join(", ");
const financeBucketsList = FINANCE_BUCKETS.join(", ");

export const ANALYSIS_SYSTEM_PROMPT = `You are an assistant that extracts structured household knowledge from OCR text of personal documents (Swiss family context).

Rules:
- Analyze ONLY the provided OCR text and metadata.
- Do NOT invent missing values. Use null if unknown.
- Prefer ISO dates yyyy-mm-dd for all date fields.
- Extract CHF amounts carefully.
- Identify whether the document is Rechnung, Vertrag, Versicherung, Garantie, Reiseunterlage, Arztbericht, Steuerdokument or Sonstiges.
- For travel/cruise documents, extract the full itinerary (ports of call / Kreuzfahrtverlauf / daily stops) into travel_items[].itinerary AND also list each stop date in important_dates.
- Also capture other date-relevant fields in important_dates: payment due, cancellation deadline, boarding, check-in, flight departure/arrival, hotel check-in/out, appointment dates, warranty end, contract start/end.
- category MUST be one of: ${categoriesList}
- travel_items[].travel_type SHOULD be one of: ${travelTypesList} (use German labels; map Cruise→Kreuzfahrt, Hotelaufenthalt→Hotel, Visa Waiver→Visa / Einreise). Flights/air tickets/e-tickets MUST be "Flug" (never Kreuzfahrt). Kreuzfahrt is ONLY for ship cruises (ports of call / Kreuzfahrtverlauf). Package PDFs may contain multiple travel_items — classify each item by its own segment (flight vs hotel vs cruise vs transfer).
- deadlines[].type SHOULD be one of: ${deadlineTypesList} (map cancellation→Kündigung, payment→Zahlung, appeal/einspruch→Einsprache)
- financial_items[].category SHOULD map into these buckets when possible: ${financeBucketsList} (use short German labels; salary/balance lines → Saldo / Konto or Lohn; never invent English duplicates)
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
  const content = selectAnalysisOcrWindow(input.content, 28000);
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
    "currency": null,
    "itinerary": [{
      "date": "2026-10-25",
      "day_label": "25 OCT",
      "location": "Barcelona, Spain",
      "arrive": null,
      "depart": "17:00",
      "note": null
    }]
  }],
  "confidence": 0.8
}

Travel/cruise specifics:
- If OCR contains "Kreuzfahrtverlauf", "PORTS-OF-CALL", "Cruise Itinerary" or similar day-by-day stops, fill travel_items[0].itinerary completely (one object per day/port).
- Put cruising/sea days as location "Cruising" with note "Seetag".
- Mirror each itinerary stop with a date into important_dates (label like "Anlaufhafen: Barcelona").
- Also put payment due dates, cancellation deadlines, boarding/sailing times into important_dates.
- Sections titled Flüge / Flugarrangements / Flight / E-Ticket are separate travel_items with travel_type "Flug", even when the same PDF also describes a cruise or hotel stay.`;
}

export function buildRepairPrompt(invalidJson: string, validationError: string): string {
  return `The previous JSON failed validation.

Validation error:
${validationError}

Invalid JSON:
${invalidJson}

Return corrected VALID JSON only, matching the required schema. No markdown.`;
}
