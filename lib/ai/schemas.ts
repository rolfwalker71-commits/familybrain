import { z } from "zod";

export const ImportantDateSchema = z.object({
  date: z.string().nullable(),
  label: z.string().nullable(),
  description: z.string().nullable(),
});

export const AmountSchema = z.object({
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  label: z.string().nullable(),
});

export const DeadlineSchema = z.object({
  title: z.string(),
  date: z.string().nullable(),
  type: z.string().nullable(),
  description: z.string().nullable(),
});

export const ContractPartySchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
});

export const WarrantyInfoSchema = z.object({
  has_warranty: z.boolean(),
  product_name: z.string().nullable(),
  manufacturer: z.string().nullable().optional(),
  vendor: z.string().nullable(),
  purchase_date: z.string().nullable(),
  warranty_until: z.string().nullable(),
  serial_number: z.string().nullable(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  warranty_months: z.number().nullable().optional(),
});

export const CancellationTermsSchema = z.object({
  has_cancellation_terms: z.boolean(),
  notice_period: z.string().nullable(),
  latest_cancellation_date: z.string().nullable(),
});

export const TodoSchema = z.object({
  title: z.string(),
  due_date: z.string().nullable(),
  priority: z.string().nullable(),
});

export const FinancialItemSchema = z.object({
  vendor: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  invoice_date: z.string().nullable(),
  /** Rechnungs-/Belegnummer when present on the invoice. */
  invoice_number: z.string().nullable().optional(),
  due_date: z.string().nullable(),
  category: z.string().nullable(),
  is_recurring: z.boolean().nullable(),
  description: z.string().nullable().optional(),
});

/** Individual product/service lines from invoices, delivery notes, work reports. */
export const LineItemSchema = z.object({
  description: z.string(),
  amount: z.number().nullable(),
  currency: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  /** Credit-card statements: Buchungs-/Transaktionsdatum der Belastung. */
  date: z.string().nullable().optional(),
  /** Credit-card statements: Händlername wie auf der Abrechnung gedruckt. */
  merchant: z.string().nullable().optional(),
  /** Credit-card statements: Originalbetrag vor Umrechnung. */
  foreign_amount: z.number().nullable().optional(),
  foreign_currency: z.string().nullable().optional(),
});

export const TravelItineraryStopSchema = z.object({
  date: z.string().nullable(),
  day_label: z.string().nullable().optional(),
  location: z.string(),
  arrive: z.string().nullable().optional(),
  depart: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const TravelItemSchema = z.object({
  travel_type: z.string().nullable(),
  provider: z.string().nullable(),
  title: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  address: z.string().nullable().optional(),
  booking_reference: z.string().nullable(),
  flight_number: z.string().nullable().optional(),
  cabin_class: z.string().nullable().optional(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  /** Ports of call / daily stops (cruise, multi-city trips, etc.) */
  itinerary: z.array(TravelItineraryStopSchema).optional().default([]),
});

export const DocumentAnalysisSchema = z.object({
  category: z.string(),
  /** Concise German Paperless title generated during analysis. */
  suggested_title: z.string().nullable().optional(),
  /** Swiss tax period year (Steuerjahr), e.g. 2025 for Lohnausweis 2025. */
  tax_year: z.number().int().min(1990).max(2100).nullable().optional(),
  /** Extra knowledge areas where this doc should also appear (e.g. Arbeit for Lohnausweis). */
  also_categories: z.array(z.string()).optional().default([]),
  /** Explicit flag: also list under Arbeit (Lohnausweis). */
  also_in_arbeit: z.boolean().nullable().optional(),
  /**
   * Primary Beleg-/Rechnungs-/Policen-/Vertrags-/Kundennummer that uniquely
   * identifies this document instance (digits or alphanumeric as printed).
   */
  document_reference: z.string().nullable().optional(),
  /** Bank name for Kontoauszug / Zinsausweis etc. */
  bank_name: z.string().nullable().optional(),
  /** Kontonummer preferred; IBAN if no local account number (summary + Steuern grouping). */
  account_number: z.string().nullable().optional(),
  short_summary: z.string().nullable(),
  detailed_summary: z.string().nullable(),
  important_points: z.array(z.string()).default([]),
  important_dates: z.array(ImportantDateSchema).default([]),
  amounts: z.array(AmountSchema).default([]),
  deadlines: z.array(DeadlineSchema).default([]),
  contract_parties: z.array(ContractPartySchema).default([]),
  warranty_info: WarrantyInfoSchema.nullable(),
  cancellation_terms: CancellationTermsSchema.nullable(),
  possible_todos: z.array(TodoSchema).default([]),
  financial_items: z.array(FinancialItemSchema).default([]),
  line_items: z.array(LineItemSchema).default([]),
  travel_items: z.array(TravelItemSchema).default([]),
  confidence: z.number().min(0).max(1).nullable(),
});

export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;
