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
- In contract_parties, list people/companies that appear. When the document is addressed to a household person (recipient / Empfänger / Adressat / Versicherte / Patient), set role to "Empfänger".
- For travel/cruise documents, extract the full itinerary (daily stops / Kreuzfahrtverlauf / stations) into travel_items[].itinerary AND also list each stop date in important_dates.
- For flights, always extract flight_number (e.g. LX80, LH400) and booking_reference when present in the OCR.
- For hotels, extract the street address into travel_items[].address when present; also capture check-in/out times as start_time/end_time when known.
- Always extract booking_reference / confirmation / PNR / reservation code into booking_reference when present.
- Also capture other date-relevant fields in important_dates: payment due, cancellation deadline, boarding, check-in, flight departure/arrival, hotel check-in/out, appointment dates, warranty end, contract start/end.
- Always set suggested_title: a concise German Paperless document title (max ~120 characters). Prefer document type + subject + organization + identifying number/date when available (e.g. «Prämienrechnung CONCORDIA Nr. 615284766», «Rechnung Swisscom 03.2026 Nr. …», «Haftpflicht Police 2026»). Never use scanner/file names (SCAN__, IMG_, DSC_, UUID-like strings). Household member / Empfänger names are optional — omit them unless needed to distinguish the document (recipients are linked separately).
- Always set document_reference when the OCR shows a Belegnummer, Rechnungsnummer, Dokumentennummer, Policennummer, Vertragsnummer, Kundennummer, Auftragsnummer, Referenz, Nr./No./Invoice # (prefer the invoice/document number over phone numbers or amounts). Also put the same value into financial_items[].invoice_number for invoices.
- short_summary MUST uniquely identify this document instance in one German sentence: include document type/subject, organization, AND whenever present (1) Beleg-/Rechnungsnummer (Nr. …) and (2) Beleg-/Rechnungsdatum (dd.mm.yyyy). Never write a generic summary that could apply to every monthly invoice from the same vendor (bad: «Prämienrechnung für Rolf Walker von CONCORDIA.» — good: «Prämienrechnung Nr. 615284766 vom 01.09.2026 von CONCORDIA.»).
- Bank documents (Kontoauszug, Bankauszug, Depotauszug, Zins- und Kapitalausweis, Vermögensausweis, account/bank statement): set category «Steuern», set tax_year when the statement period year is known, extract bank_name and account_number (Kontonummer preferred, else IBAN). Short bank names (e.g. «Raiffeisen»). Append account in short_summary as «(…)».
- Credit-card statements (Kreditkartenabrechnung, Visa/Mastercard bill): set category «Kreditkarten» (NOT Steuern). Extract card number (masked ok) into account_number; append as «(•••• 4291)» in short_summary.
- Computer / IT (software licenses, Microsoft 365, Adobe, hardware invoices for PC/laptop/monitor): set category «Computer».
- Swiss tax documents for the Steuererklärung (Steuererklärung, Veranlagung, Steuerrechnung/-bescheid, Quellensteuer, Lohnausweis / Lohnmeldeschein, Belege die typischerweise der Steuererklärung beigelegt werden): set category to «Steuern». For Lohnausweis/Lohnmeldeschein also set also_in_arbeit=true (or also_categories including «Arbeit»). Set tax_year to the Steuerperiode / Steuerjahr as an integer (e.g. Lohnausweis 2025 → 2025), not the scan date unless no period is visible.
- Monthly payslips (Lohnabrechnung, Gehaltsabrechnung, Verdienstabrechnung, payslip) are NOT Steuern — set category «Arbeit». Only the annual Lohnausweis / Lohnmeldeschein belongs in Steuern.
- category MUST be one of: ${categoriesList}
- travel_items[].travel_type SHOULD be one of: ${travelTypesList} (use German labels; map Cruise→Kreuzfahrt, Hotelaufenthalt→Hotel, Visa Waiver→Visa / Einreise). Flights/air tickets/e-tickets MUST be "Flug" (never Kreuzfahrt). Kreuzfahrt is ONLY for ship cruises (ports of call / Kreuzfahrtverlauf). Package PDFs may contain multiple travel_items — classify each item by its own segment (flight vs hotel vs cruise vs transfer).
- deadlines[].type SHOULD be one of: ${deadlineTypesList} (map cancellation→Kündigung, payment→Zahlung, appeal/einspruch→Einsprache)
- financial_items[].category SHOULD map into these buckets when possible: ${financeBucketsList} (use short German labels; salary/balance lines → Saldo / Konto or Lohn; never invent English duplicates)
- For invoices (Rechnung), delivery notes (Lieferschein), quotes, work reports, or any document with a list of products/services/activities: extract EACH line into line_items[] with description (product/service name only — do NOT prefix quantity like "7x ·" into description), amount (line total), and quantity as a separate number when visible (Stückzahl / Menge / «3x»). Put unit in unit when present (Stk, kg, m, …). Do NOT put totals, VAT-only lines, or shipping into line_items — put the invoice grand total into amounts[] with label «Gesamtbetrag» (and also financial_items[].amount). Skip line_items when there is no itemized list.
- Return VALID JSON only. No markdown. No commentary.
- Category must be one of: ${categoriesList}`;

export function buildAnalysisUserPrompt(input: {
  title: string | null;
  correspondent: string | null;
  documentType: string | null;
  createdDate: string | null;
  tags: string[];
  content: string | null;
  householdMembers?: string[];
}): string {
  const content = selectAnalysisOcrWindow(input.content, 28000);
  const household =
    input.householdMembers && input.householdMembers.length > 0
      ? input.householdMembers.join(", ")
      : null;
  return `Analyze this Paperless document and return JSON matching the required schema.

Metadata:
- Title: ${input.title ?? "null"}
- Correspondent: ${input.correspondent ?? "null"}
- Document type: ${input.documentType ?? "null"}
- Created date: ${input.createdDate ?? "null"}
- Tags: ${input.tags.length ? input.tags.join(", ") : "none"}
${household ? `- Household members (possible Empfänger): ${household}` : ""}

OCR content:
"""
${content}
"""

Required JSON shape:
{
  "category": "Versicherungen",
  "suggested_title": "Haftpflichtversicherung Police 2026",
  "tax_year": null,
  "also_categories": [],
  "also_in_arbeit": false,
  "document_reference": "615284766",
  "bank_name": null,
  "account_number": null,
  "short_summary": "Prämienrechnung Nr. 615284766 vom 01.09.2026 von CONCORDIA.",
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
    "invoice_number": null,
    "due_date": null,
    "category": null,
    "is_recurring": false,
    "description": null
  }],
  "line_items": [{
    "description": "Produkt oder Leistung",
    "amount": 12.5,
    "currency": "CHF",
    "quantity": 1,
    "unit": null
  }],
  "travel_items": [{
    "travel_type": null,
    "provider": null,
    "title": null,
    "start_date": null,
    "end_date": null,
    "start_time": null,
    "end_time": null,
    "origin": null,
    "destination": null,
    "address": null,
    "booking_reference": null,
    "flight_number": null,
    "cabin_class": null,
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

Title (suggested_title):
- Always rewrite a clear German archive title, even when metadata Title is already set (scanner names like SCAN__… must be replaced).
- Focus on what the document is; do not force household names into the title.
- When a Beleg-/Rechnungsnummer is visible, include «Nr. …» in the title.

Identity (document_reference / short_summary):
- Extract the strongest document identifier into document_reference (Rechnungsnr., Belegnr., Policen-/Vertragsnr., Referenz).
- short_summary must include that number as «Nr. …» and the Beleg-/Rechnungsdatum when known — so two monthly invoices from the same vendor never share the same summary text.
- Also set financial_items[].invoice_number and invoice_date for invoices/bills.

Tax (Steuern / tax_year):
- For Swiss Steuererklärung-related docs set category «Steuern» and tax_year to the tax period year when known.
- Lohnausweis → category «Steuern», also_in_arbeit true, tax_year = year on the form.
- Lohnabrechnung / monthly payslip → category «Arbeit», never «Steuern».
- Bank docs (Kontoauszug, Zins-/Kapitalausweis, Depotauszug, …) → category «Steuern»; account/IBAN in short_summary «(…)».
- Kreditkartenabrechnungen → category «Kreditkarten» (not Steuern); Kartennummer in «(…)».
- Computer / Software / Lizenzen / PC-Hardware → category «Computer».

Travel/cruise specifics:
- If OCR contains "Kreuzfahrtverlauf", "PORTS-OF-CALL", "Cruise Itinerary" or similar day-by-day stops, fill travel_items[0].itinerary completely (one object per day/port).
- Put cruising/sea days as location "Cruising" with note "Seetag".
- Mirror each itinerary stop with a date into important_dates (label = location name only, e.g. "Barcelona" or "Zürich HB" — never "Anlaufhafen" or "Port of Call").
- Also put payment due dates, cancellation deadlines, boarding/sailing times into important_dates.
- For Flug items: set flight_number (IATA+digits), cabin_class when visible (Economy / Premium Economy / Business / First), and booking_reference/PNR when visible; set start_time/end_time from scheduled departure/arrival when known.
- For Hotel items: set address to the full street address when present; destination can be the city.
- Sections titled Flüge / Flugarrangements / Flight / E-Ticket are separate travel_items with travel_type "Flug", even when the same PDF also describes a cruise or hotel stay.

Line items (Rechnungen / Lieferscheine / Belege):
- Prefer the article/service text as description (German as on the document); never embed quantity in the description text.
- quantity = Stückzahl/Menge as a number when shown (e.g. 7 for «7x» or «7 Stk»); null if unknown.
- amount is the line total (inkl. or excl. MwSt as shown for that line); currency defaults to CHF when Swiss.
- Always add the final payable/invoice total to amounts with label exactly «Gesamtbetrag» when a total is visible (Endbetrag / Total / Zu zahlen / Rechnungsbetrag).
- financial_items holds the invoice as a whole (vendor, due date, total); line_items holds the individual positions.`;
}

export function buildRepairPrompt(invalidJson: string, validationError: string): string {
  return `The previous JSON failed validation.

Validation error:
${validationError}

Invalid JSON:
${invalidJson}

Return corrected VALID JSON only, matching the required schema. No markdown.`;
}
