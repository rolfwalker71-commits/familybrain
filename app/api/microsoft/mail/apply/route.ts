import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasGoogleTasksScope,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { createGoogleTask } from "@/lib/google/tasks";
import { createReferenceNote } from "@/lib/mail/reference-notes";
import {
  MsDayEventSuggestionSchema,
  MsDayReplyDraftSchema,
  MsDayTaskSuggestionSchema,
} from "@/lib/microsoft/analyze-mail-day";
import {
  createOutlookCalendarEvent,
  createOutlookMailDraft,
} from "@/lib/microsoft/mail-day-actions";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tasks: z.array(MsDayTaskSuggestionSchema).max(12).optional().default([]),
  events: z.array(MsDayEventSuggestionSchema).max(8).optional().default([]),
  replies: z.array(MsDayReplyDraftSchema).max(8).optional().default([]),
  tasklistId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const msUserId = resolveMicrosoftUserId(auth);
  if (msUserId == null || !isMicrosoftConnected(msUserId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  if (
    body.tasks.length === 0 &&
    body.events.length === 0 &&
    body.replies.length === 0
  ) {
    return NextResponse.json(
      { error: "Keine Auswahl zum Übernehmen." },
      { status: 400 }
    );
  }

  const googleUserId = resolveGoogleUserId(auth);
  const useGoogle =
    googleUserId != null &&
    isGoogleMailConnected(googleUserId) &&
    hasGoogleTasksScope(googleUserId);

  const created: Array<{
    title: string;
    ok: boolean;
    kind: "task" | "event" | "reply";
    target: string;
    link?: string | null;
    error?: string;
  }> = [];

  for (const task of body.tasks) {
    const counterpart = [
      task.company?.trim() || null,
      task.counterpartEmail?.trim() || null,
    ]
      .filter(Boolean)
      .join(" · ");
    const notes = [
      task.notes?.trim() || null,
      task.theme ? `Thema: ${task.theme}` : null,
      counterpart ? `Gegenstelle: ${counterpart}` : null,
      task.sourceSubject ? `Quelle Mail: ${task.sourceSubject}` : null,
      "Übernommen aus Microsoft 365 Tagesanalyse (Buddy)",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      if (useGoogle && googleUserId != null) {
        const g = await createGoogleTask(
          googleUserId,
          {
            title: task.title,
            notes,
            dueDate: task.dueDate,
            tasklistId: body.tasklistId,
          },
          request
        );
        created.push({
          title: g.title,
          ok: true,
          kind: "task",
          target: "google_task",
          link: g.href,
        });
      } else {
        const note = await createReferenceNote({
          userId: msUserId,
          title: task.title,
          body: notes,
          reference: task.sourceMailId
            ? `o365:${task.sourceMailId}`
            : null,
          sourceMessageId: task.sourceMailId || undefined,
        });
        created.push({
          title: note.title,
          ok: true,
          kind: "task",
          target: "note",
          link: note.triliumNoteId ? `trilium:${note.triliumNoteId}` : null,
        });
      }
    } catch (error) {
      created.push({
        title: task.title,
        ok: false,
        kind: "task",
        target: useGoogle ? "google_task" : "note",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const event of body.events) {
    const notes = [
      event.notes?.trim() || null,
      event.theme ? `Thema: ${event.theme}` : null,
      [event.company, event.counterpartEmail].filter(Boolean).join(" · ") ||
        null,
      event.sourceSubject ? `Quelle Mail: ${event.sourceSubject}` : null,
      "Übernommen aus Microsoft 365 Tagesanalyse (Buddy)",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const ev = await createOutlookCalendarEvent(msUserId, {
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        location: event.location,
        notes,
      });
      created.push({
        title: ev.subject,
        ok: true,
        kind: "event",
        target: "outlook_event",
        link: ev.webLink,
      });
    } catch (error) {
      created.push({
        title: event.title,
        ok: false,
        kind: "event",
        target: "outlook_event",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const reply of body.replies) {
    try {
      const draft = await createOutlookMailDraft(msUserId, {
        to: reply.to,
        subject: reply.subject,
        body: reply.body,
        sourceMailId: reply.sourceMailId,
      });
      created.push({
        title: draft.subject,
        ok: true,
        kind: "reply",
        target: "outlook_draft",
        link: draft.webLink,
      });
    } catch (error) {
      created.push({
        title: reply.subject,
        ok: false,
        kind: "reply",
        target: "outlook_draft",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: created.some((c) => c.ok),
    preferGoogleTasks: useGoogle,
    created,
    okCount: created.filter((c) => c.ok).length,
    taskOk: created.filter((c) => c.kind === "task" && c.ok).length,
    eventOk: created.filter((c) => c.kind === "event" && c.ok).length,
    replyOk: created.filter((c) => c.kind === "reply" && c.ok).length,
  });
}
