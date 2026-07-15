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
  due_date: z.string().nullable(),
  category: z.string().nullable(),
  is_recurring: z.boolean().nullable(),
  description: z.string().nullable().optional(),
});

export const TravelItemSchema = z.object({
  travel_type: z.string().nullable(),
  provider: z.string().nullable(),
  title: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  booking_reference: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
});

export const DocumentAnalysisSchema = z.object({
  category: z.string(),
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
  travel_items: z.array(TravelItemSchema).default([]),
  confidence: z.number().min(0).max(1).nullable(),
});

export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;
