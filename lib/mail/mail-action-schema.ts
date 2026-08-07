import { z } from "zod";

export const MailSuggestionSchema = z.object({
  kind: z.enum(["event", "task", "note", "trip", "finance"]),
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
  reason: z.string().max(400).optional(),
  confidence: z.number().min(0).max(1).optional(),
  /** event */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(400).nullable().optional(),
  /** When set, update this Google Calendar event instead of creating a new one. */
  patchEventId: z.string().max(200).nullable().optional(),
  /** Calendar that owns patchEventId (required for patch). */
  calendarId: z.string().max(200).nullable().optional(),
  /** task */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** note — e.g. tracking number */
  reference: z.string().max(200).nullable().optional(),
  /** trip — Flug / Hotel / Zugreisen / … */
  tripType: z.string().max(40).nullable().optional(),
  provider: z.string().max(120).nullable().optional(),
  bookingReference: z.string().max(120).nullable().optional(),
  /** finance — invoice / mahnung */
  amount: z.number().finite().nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  /** Matched open Paperless document (Buddy local id). */
  documentId: z.number().int().positive().nullable().optional(),
});

export const MailReplyDraftSchema = z.object({
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(4000),
  tone: z.string().max(80).nullable().optional(),
});

export const MailSuggestedMemberSchema = z.object({
  memberId: z.number().int().positive(),
  displayName: z.string().min(1).max(120),
});

export const MailAnalysisSchema = z.object({
  summary: z.string().max(500),
  relevance: z.enum(["none", "low", "medium", "high"]),
  suggestions: z.array(MailSuggestionSchema).max(8),
  replyDraft: MailReplyDraftSchema.nullable().optional(),
  suggestedMember: MailSuggestedMemberSchema.nullable().optional(),
});

export type MailSuggestion = z.infer<typeof MailSuggestionSchema>;
export type MailAnalysis = z.infer<typeof MailAnalysisSchema>;
export type MailReplyDraft = z.infer<typeof MailReplyDraftSchema>;

export const MailActionsBodySchema = z.object({
  confirmDuplicates: z.boolean().optional(),
  /** Family member from analysis — persisted into notes / doc recipients. */
  memberId: z.number().int().positive().optional().nullable(),
  memberDisplayName: z.string().max(120).optional().nullable(),
  actions: z
    .array(
      z.object({
        kind: z.enum(["event", "task", "note", "trip", "finance"]),
        title: z.string().min(1).max(200),
        notes: z.string().max(2000).nullable().optional(),
        startDate: z.string().optional().nullable(),
        startTime: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
        endTime: z.string().optional().nullable(),
        allDay: z.boolean().optional(),
        location: z.string().optional().nullable(),
        dueDate: z.string().optional().nullable(),
        reference: z.string().optional().nullable(),
        calendarId: z.string().optional().nullable(),
        tasklistId: z.string().optional().nullable(),
        patchEventId: z.string().optional().nullable(),
        tripType: z.string().optional().nullable(),
        provider: z.string().optional().nullable(),
        bookingReference: z.string().optional().nullable(),
        tripId: z.number().int().positive().optional().nullable(),
        newTripTitle: z.string().max(200).optional().nullable(),
        amount: z.number().finite().optional().nullable(),
        currency: z.string().max(8).optional().nullable(),
        vendor: z.string().max(200).optional().nullable(),
        documentId: z.number().int().positive().optional().nullable(),
      })
    )
    .min(1)
    .max(8),
});
