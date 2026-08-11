import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  MsDayEventSuggestionSchema,
  MsDayReplyDraftSchema,
  MsDayTaskApplySchema,
} from "@/lib/microsoft/analyze-mail-day";
import {
  createOutlookCalendarEvent,
  createOutlookTodoTask,
} from "@/lib/microsoft/mail-day-actions";
import {
  createOutlookMailDraftWithSignature,
  sendOutlookMail,
} from "@/lib/microsoft/mail-message-actions";
import {
  hasMicrosoftMailSendScope,
  hasMicrosoftTasksScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tasks: z.array(MsDayTaskApplySchema).max(12).optional().default([]),
  events: z.array(MsDayEventSuggestionSchema).max(20).optional().default([]),
  replies: z.array(MsDayReplyDraftSchema).max(8).optional().default([]),
  /** When true, send reply mails instead of leaving Outlook drafts. */
  sendReplies: z.boolean().optional().default(false),
  includeSignature: z.boolean().optional(),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
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

  if (body.tasks.length > 0 && !hasMicrosoftTasksScope(msUserId)) {
    return NextResponse.json(
      {
        error:
          "Microsoft To Do-Recht fehlt. Bitte unter Konto Microsoft 365 neu verbinden (Tasks.ReadWrite).",
      },
      { status: 403 }
    );
  }

  const created: Array<{
    title: string;
    ok: boolean;
    kind: "task" | "event" | "reply";
    target: string;
    link?: string | null;
    error?: string;
  }> = [];

  for (const task of body.tasks) {
    if (task.existingTask?.id) {
      // Bereits in To Do (offen oder erledigt) — nicht erneut anlegen.
      continue;
    }
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
      "Übernommen aus Microsoft 365 Mail-Analyse (Buddy)",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const t = await createOutlookTodoTask(msUserId, {
        title: task.title,
        notes,
        dueDate: task.dueDate,
      });
      created.push({
        title: t.title,
        ok: true,
        kind: "task",
        target: "outlook_todo",
        link: t.webLink,
      });
    } catch (error) {
      created.push({
        title: task.title,
        ok: false,
        kind: "task",
        target: "outlook_todo",
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
      "Übernommen aus Microsoft 365 Mail-Analyse (Buddy)",
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
      if (body.sendReplies) {
        if (!hasMicrosoftMailSendScope(msUserId)) {
          created.push({
            title: reply.subject,
            ok: false,
            kind: "reply",
            target: "outlook_send",
            error:
              "Mail.Send fehlt. Bitte Microsoft 365 unter Konto neu verbinden.",
          });
          continue;
        }
        const sent = await sendOutlookMail(msUserId, {
          to: reply.to,
          subject: reply.subject,
          body: reply.body,
          sourceMailId: reply.sourceMailId,
          includeSignature: body.includeSignature,
        });
        created.push({
          title: sent.subject,
          ok: true,
          kind: "reply",
          target: "outlook_send",
          link: null,
        });
      } else {
        const draft = await createOutlookMailDraftWithSignature(msUserId, {
          to: reply.to,
          subject: reply.subject,
          body: reply.body,
          sourceMailId: reply.sourceMailId,
          includeSignature: body.includeSignature,
        });
        created.push({
          title: draft.subject,
          ok: true,
          kind: "reply",
          target: "outlook_draft",
          link: draft.webLink,
        });
      }
    } catch (error) {
      created.push({
        title: reply.subject,
        ok: false,
        kind: "reply",
        target: body.sendReplies ? "outlook_send" : "outlook_draft",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = created.filter((c) => !c.ok);
  return NextResponse.json({
    ok: created.some((c) => c.ok),
    created,
    okCount: created.filter((c) => c.ok).length,
    failCount: failed.length,
    errors: failed.map((f) => f.error).filter(Boolean),
    taskOk: created.filter((c) => c.kind === "task" && c.ok).length,
    eventOk: created.filter((c) => c.kind === "event" && c.ok).length,
    replyOk: created.filter((c) => c.kind === "reply" && c.ok).length,
  });
}
