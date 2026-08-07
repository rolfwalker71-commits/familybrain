import { z } from "zod";

export const MailSuggestionSchema = z.object({
  kind: z.enum(["event", "task", "note"]),
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
  /** task */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** note — e.g. tracking number */
  reference: z.string().max(200).nullable().optional(),
});

export const MailAnalysisSchema = z.object({
  summary: z.string().max(500),
  relevance: z.enum(["none", "low", "medium", "high"]),
  suggestions: z.array(MailSuggestionSchema).max(8),
});

export type MailSuggestion = z.infer<typeof MailSuggestionSchema>;
export type MailAnalysis = z.infer<typeof MailAnalysisSchema>;

export const MailActionsBodySchema = z.object({
  actions: z
    .array(
      z.object({
        kind: z.enum(["event", "task", "note"]),
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
      })
    )
    .min(1)
    .max(8),
});
