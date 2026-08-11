import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  listOutlookTodoLists,
  listOutlookTodoTasksUpcoming,
  updateOutlookTodoTask,
} from "@/lib/microsoft/mail-day-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  taskId: z.string().min(1).max(200),
  listId: z.string().min(1).max(200),
  status: z.enum(["notStarted", "completed"]).optional(),
  title: z.string().min(1).max(500).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  moveToListId: z.string().min(1).max(200).optional(),
});

/** Offene To-Do-Aufgaben über alle Listen (+ Listen für Verschieben). */
export async function GET() {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  try {
    const [tasks, lists] = await Promise.all([
      listOutlookTodoTasksUpcoming(userId, { allOpen: true, undatedLimit: 200 }),
      listOutlookTodoLists(userId),
    ]);
    return NextResponse.json({ ok: true, tasks, lists });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "To-Do-Aufgaben konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
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
    const task = await updateOutlookTodoTask(userId, body);
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "To-Do-Aufgabe konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}
