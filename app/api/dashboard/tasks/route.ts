import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveCalendarUserId } from "@/lib/calendar/ics-calendars";
import { loadHomeTasksBundle } from "@/lib/dashboard/home-tasks";
import { updateGoogleTask } from "@/lib/google/tasks";
import {
  hasGoogleTasksScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import { updateOutlookTodoTask } from "@/lib/microsoft/mail-day-actions";
import {
  hasMicrosoftTasksScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { updatePlannerTask } from "@/lib/microsoft/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  source: z.enum(["google", "todo", "planner"]),
  id: z.string().min(1).max(200),
  listId: z.string().max(200).nullable().optional(),
  etag: z.string().max(500).nullable().optional(),
  /** complete / reopen / reschedule / moveBucket (Planner) */
  action: z.enum(["complete", "reopen", "reschedule", "moveBucket"]),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  bucketId: z.string().min(1).max(80).optional(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveCalendarUserId(auth);
  const bundle = await loadHomeTasksBundle(userId, { horizonDays: 7 });
  return NextResponse.json({ ok: true, ...bundle });
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveCalendarUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  try {
    if (body.source === "google") {
      if (!isGoogleMailConnected(userId) || !hasGoogleTasksScope(userId)) {
        return NextResponse.json(
          { error: "Google Tasks nicht verfügbar." },
          { status: 403 }
        );
      }
      if (!body.listId) {
        return NextResponse.json(
          { error: "listId fehlt für Google Task." },
          { status: 400 }
        );
      }
      const task = await updateGoogleTask(
        userId,
        {
          taskId: body.id,
          listId: body.listId,
          status:
            body.action === "complete"
              ? "completed"
              : body.action === "reopen"
                ? "needsAction"
                : undefined,
          dueDate:
            body.action === "reschedule" ? body.dueDate ?? null : undefined,
        },
        request
      );
      return NextResponse.json({ ok: true, task });
    }

    if (body.source === "todo") {
      if (!isMicrosoftConnected(userId) || !hasMicrosoftTasksScope(userId)) {
        return NextResponse.json(
          { error: "Outlook To Do nicht verfügbar." },
          { status: 403 }
        );
      }
      const task = await updateOutlookTodoTask(userId, {
        taskId: body.id,
        listId: body.listId,
        status:
          body.action === "complete"
            ? "completed"
            : body.action === "reopen"
              ? "notStarted"
              : undefined,
        dueDate:
          body.action === "reschedule" ? body.dueDate ?? null : undefined,
      });
      return NextResponse.json({ ok: true, task });
    }

    // planner
    if (!isMicrosoftConnected(userId) || !hasMicrosoftTasksScope(userId)) {
      return NextResponse.json(
        { error: "Planner nicht verfügbar." },
        { status: 403 }
      );
    }
    if (body.action === "moveBucket" && !body.bucketId) {
      return NextResponse.json(
        { error: "bucketId fehlt für Bucket-Wechsel." },
        { status: 400 }
      );
    }
    const task = await updatePlannerTask(userId, {
      taskId: body.id,
      etag: body.etag,
      percentComplete:
        body.action === "complete"
          ? 100
          : body.action === "reopen"
            ? 0
            : undefined,
      dueDate:
        body.action === "reschedule" ? body.dueDate ?? null : undefined,
      bucketId: body.action === "moveBucket" ? body.bucketId : undefined,
    });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Aufgabe konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}
