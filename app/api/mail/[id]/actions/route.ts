import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasGoogleCalendarEventsWriteScope,
  hasGoogleTasksScope,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { createGoogleCalendarEvent } from "@/lib/google/calendar-write";
import { createGoogleTask } from "@/lib/google/tasks";
import { MailActionsBodySchema } from "@/lib/mail/mail-action-schema";
import { getGmailMessage } from "@/lib/mail/gmail";
import { updateMailAnalysisStatus } from "@/lib/mail/mail-analysis-store";
import { createReferenceNote } from "@/lib/mail/reference-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google-Konto nicht verbunden." },
      { status: 400 }
    );
  }

  let body: ReturnType<typeof MailActionsBodySchema.parse>;
  try {
    body = MailActionsBodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  let mailFrom = "";
  try {
    const message = await getGmailMessage(userId, id, request);
    mailFrom = message.fromName;
  } catch {
    mailFrom = "";
  }

  const created: Array<{
    kind: "event" | "task" | "note";
    title: string;
    ok: boolean;
    error?: string;
    link?: string | null;
    notes?: string | null;
    reference?: string | null;
    startDate?: string | null;
    startTime?: string | null;
    endDate?: string | null;
    endTime?: string | null;
    allDay?: boolean | null;
    location?: string | null;
    dueDate?: string | null;
  }> = [];

  for (const action of body.actions) {
    const base = (action.notes || "").trim();
    const fromLine =
      mailFrom && !base.toLowerCase().includes(`von: ${mailFrom}`.toLowerCase())
        ? `Von: ${mailFrom}`
        : null;
    const notes = [base || null, fromLine].filter(Boolean).join("\n\n");

    if (action.kind === "note") {
      try {
        const note = await createReferenceNote({
          userId,
          title: action.title,
          body: notes,
          reference: action.reference,
          sourceMessageId: id,
        });
        created.push({
          kind: "note",
          title: note.title,
          ok: true,
          link: note.triliumNoteId
            ? `trilium:${note.triliumNoteId}`
            : null,
          notes,
          reference: action.reference,
        });
      } catch (error) {
        created.push({
          kind: "note",
          title: action.title,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    if (action.kind === "event") {
      if (!hasGoogleCalendarEventsWriteScope(userId)) {
        created.push({
          kind: "event",
          title: action.title,
          ok: false,
          error: "Kalender-Schreibrecht fehlt",
        });
        continue;
      }
      if (!action.calendarId?.trim() || !action.startDate) {
        created.push({
          kind: "event",
          title: action.title,
          ok: false,
          error: "Kalender oder Datum fehlt",
        });
        continue;
      }
      try {
        const ev = await createGoogleCalendarEvent(
          userId,
          {
            calendarId: action.calendarId,
            title: action.title,
            description: notes,
            location: action.location,
            startDate: action.startDate,
            startTime: action.startTime,
            endDate: action.endDate || action.startDate,
            endTime: action.endTime,
            allDay: action.allDay,
          },
          request
        );
        created.push({
          kind: "event",
          title: ev.summary,
          ok: true,
          link: ev.htmlLink,
          notes,
          startDate: action.startDate,
          startTime: action.startTime,
          endDate: action.endDate || action.startDate,
          endTime: action.endTime,
          allDay: action.allDay,
          location: action.location,
        });
      } catch (error) {
        created.push({
          kind: "event",
          title: action.title,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    if (!hasGoogleTasksScope(userId)) {
      created.push({
        kind: "task",
        title: action.title,
        ok: false,
        error: "Tasks-Recht fehlt",
      });
      continue;
    }
    try {
      const task = await createGoogleTask(
        userId,
        {
          title: action.title,
          notes,
          dueDate: action.dueDate,
          tasklistId: action.tasklistId,
        },
        request
      );
      created.push({
        kind: "task",
        title: task.title,
        ok: true,
        link: task.href,
        notes,
        dueDate: action.dueDate,
      });
    } catch (error) {
      created.push({
        kind: "task",
        title: action.title,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const okCount = created.filter((c) => c.ok).length;
  let threadNote: { ok: boolean; skipped?: string; error?: string } | null =
    null;
  if (okCount > 0) {
    updateMailAnalysisStatus(userId, id, "applied");
    const { applyGmailStatusLabel } = await import("@/lib/mail/gmail-labels");
    await applyGmailStatusLabel(userId, id, "applied", request).catch(
      () => undefined
    );
    const { sendApplyNoteInThread } = await import(
      "@/lib/mail/gmail-thread-note"
    );
    threadNote = await sendApplyNoteInThread(
      userId,
      id,
      created.filter((c) => c.ok),
      request
    );
  }
  return NextResponse.json({
    created,
    okCount,
    failCount: created.length - okCount,
    threadNote,
  });
}
