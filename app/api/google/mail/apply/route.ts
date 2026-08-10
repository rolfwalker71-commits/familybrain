import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  MsDayEventSuggestionSchema,
  MsDayReplyDraftSchema,
  MsDayTaskApplySchema,
} from "@/lib/microsoft/analyze-mail-day";
import { createGoogleCalendarEvent } from "@/lib/google/calendar-write";
import { listGoogleCalendarsForUser } from "@/lib/google/calendars";
import { createGoogleTask } from "@/lib/google/tasks";
import {
  createGmailDraft,
  createGmailReplyDraft,
} from "@/lib/mail/gmail-draft";
import {
  hasGoogleTasksScope,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tasks: z.array(MsDayTaskApplySchema).max(12).optional().default([]),
  events: z.array(MsDayEventSuggestionSchema).max(20).optional().default([]),
  replies: z.array(MsDayReplyDraftSchema).max(8).optional().default([]),
});

async function resolvePrimaryCalendarId(
  userId: number,
  request: Request
): Promise<string> {
  const { calendars } = await listGoogleCalendarsForUser(userId, request);
  const writable = calendars.filter((c) => {
    const role = (c.accessRole || "").toLowerCase();
    return !role || role === "owner" || role === "writer";
  });
  const pool = writable.length > 0 ? writable : calendars;
  return pool.find((c) => c.primary)?.id || pool[0]?.id || "primary";
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google Workspace nicht verbunden." },
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

  if (body.tasks.length > 0 && !hasGoogleTasksScope(userId)) {
    return NextResponse.json(
      {
        error:
          "Google Tasks-Recht fehlt. Bitte unter Konto Google neu verbinden (Tasks).",
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
      // Bereits in Google Tasks — nicht erneut anlegen.
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
      "Übernommen aus Gmail-Tagesanalyse (Buddy)",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const t = await createGoogleTask(
        userId,
        {
          title: task.title,
          notes,
          dueDate: task.dueDate,
        },
        request
      );
      created.push({
        title: t.title,
        ok: true,
        kind: "task",
        target: "google_tasks",
        link: t.href,
      });
    } catch (error) {
      created.push({
        title: task.title,
        ok: false,
        kind: "task",
        target: "google_tasks",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let calendarId: string | null = null;
  if (body.events.length > 0) {
    try {
      calendarId = await resolvePrimaryCalendarId(userId, request);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      for (const event of body.events) {
        created.push({
          title: event.title,
          ok: false,
          kind: "event",
          target: "google_calendar",
          error: msg,
        });
      }
    }
  }

  if (calendarId) {
    for (const event of body.events) {
      const notes = [
        event.notes?.trim() || null,
        event.theme ? `Thema: ${event.theme}` : null,
        [event.company, event.counterpartEmail].filter(Boolean).join(" · ") ||
          null,
        event.sourceSubject ? `Quelle Mail: ${event.sourceSubject}` : null,
        "Übernommen aus Gmail-Tagesanalyse (Buddy)",
      ]
        .filter(Boolean)
        .join("\n\n");
      try {
        const ev = await createGoogleCalendarEvent(
          userId,
          {
            calendarId,
            title: event.title,
            startDate: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            allDay: event.allDay,
            location: event.location,
            description: notes,
          },
          request
        );
        created.push({
          title: ev.summary,
          ok: true,
          kind: "event",
          target: "google_calendar",
          link: ev.htmlLink,
        });
      } catch (error) {
        created.push({
          title: event.title,
          ok: false,
          kind: "event",
          target: "google_calendar",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const reply of body.replies) {
    try {
      if (reply.sourceMailId) {
        const draft = await createGmailReplyDraft(
          userId,
          reply.sourceMailId,
          {
            subject: reply.subject,
            body: reply.body,
            to: reply.to,
          },
          request
        );
        if (!draft.ok) {
          throw new Error(draft.error || draft.skipped || "Entwurf fehlgeschlagen");
        }
        created.push({
          title: reply.subject,
          ok: true,
          kind: "reply",
          target: "gmail_draft",
          link: null,
        });
      } else {
        const draft = await createGmailDraft(
          userId,
          {
            to: reply.to,
            subject: reply.subject,
            body: reply.body,
          },
          request
        );
        if (!draft.ok) {
          throw new Error(draft.error || draft.skipped || "Entwurf fehlgeschlagen");
        }
        created.push({
          title: reply.subject,
          ok: true,
          kind: "reply",
          target: "gmail_draft",
          link: null,
        });
      }
    } catch (error) {
      created.push({
        title: reply.subject,
        ok: false,
        kind: "reply",
        target: "gmail_draft",
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
