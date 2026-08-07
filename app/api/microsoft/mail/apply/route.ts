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
import { MsDayTaskSuggestionSchema } from "@/lib/microsoft/analyze-mail-day";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tasks: z.array(MsDayTaskSuggestionSchema).min(1).max(12),
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

  const googleUserId = resolveGoogleUserId(auth);
  const useGoogle =
    googleUserId != null &&
    isGoogleMailConnected(googleUserId) &&
    hasGoogleTasksScope(googleUserId);

  const created: Array<{
    title: string;
    ok: boolean;
    target: "google_task" | "note";
    link?: string | null;
    error?: string;
  }> = [];

  for (const task of body.tasks) {
    const notes = [
      task.notes?.trim() || null,
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
          target: "note",
          link: note.triliumNoteId ? `trilium:${note.triliumNoteId}` : null,
        });
      }
    } catch (error) {
      created.push({
        title: task.title,
        ok: false,
        target: useGoogle ? "google_task" : "note",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: created.some((c) => c.ok),
    preferGoogleTasks: useGoogle,
    created,
    okCount: created.filter((c) => c.ok).length,
  });
}
