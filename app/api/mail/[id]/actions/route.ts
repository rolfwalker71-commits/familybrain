import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasGoogleCalendarEventsWriteScope,
  hasGoogleTasksScope,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "@/lib/google/calendar-write";
import { createGoogleTask } from "@/lib/google/tasks";
import { MailActionsBodySchema } from "@/lib/mail/mail-action-schema";
import { getGmailMessage } from "@/lib/mail/gmail";
import {
  getMailAnalysis,
  updateMailAnalysisStatus,
} from "@/lib/mail/mail-analysis-store";
import { createReferenceNote } from "@/lib/mail/reference-notes";
import { collectApplyWarnings } from "@/lib/mail/apply-checks";
import { insertMailAppliedLink } from "@/lib/mail/mail-applied-links";
import { recordMailSenderApplied } from "@/lib/mail/mail-sender-prefs";

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

  const stored = getMailAnalysis(userId, id);
  let mailFrom = "";
  let threadId = stored?.threadId || null;
  let fromEmail = stored?.fromEmail || null;
  try {
    const message = await getGmailMessage(userId, id, request);
    mailFrom = message.fromName;
    threadId = message.threadId || threadId;
    fromEmail = message.from || fromEmail;
  } catch {
    mailFrom = stored?.fromName || "";
  }

  if (!body.confirmDuplicates) {
    const warnings = await collectApplyWarnings(
      userId,
      threadId,
      body.actions.map((a) => ({
        kind: a.kind,
        title: a.title,
        reference: a.reference,
        startDate: a.startDate,
        startTime: a.startTime,
        endTime: a.endTime,
        patchEventId: a.patchEventId,
      }))
    );
    if (warnings.length > 0) {
      return NextResponse.json(
        {
          error: "Bitte Konflikte/Dubletten bestätigen.",
          warnings,
          needsConfirm: true,
        },
        { status: 422 }
      );
    }
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
    patched?: boolean;
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
        insertMailAppliedLink({
          userId,
          messageId: id,
          threadId,
          kind: "note",
          title: note.title,
          reference: action.reference,
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
        const patchId = action.patchEventId?.trim();
        const ev = patchId
          ? await updateGoogleCalendarEvent(
              userId,
              {
                eventId: patchId,
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
            )
          : await createGoogleCalendarEvent(
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
        insertMailAppliedLink({
          userId,
          messageId: id,
          threadId,
          kind: "event",
          title: ev.summary,
          googleEventId: ev.id,
          calendarId: ev.calendarId,
          startDate: action.startDate,
          startTime: action.startTime,
          endDate: action.endDate || action.startDate,
          endTime: action.endTime,
          reference: action.reference,
        });
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
          patched: Boolean(patchId),
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
      insertMailAppliedLink({
        userId,
        messageId: id,
        threadId,
        kind: "task",
        title: task.title,
        taskId: task.id,
        reference: action.reference,
      });
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
    recordMailSenderApplied(userId, fromEmail);
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
