import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasGoogleTasksScope,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import {
  createGoogleTask,
  listGoogleTaskLists,
  listManagedGoogleTasks,
  listUpcomingGoogleTasks,
  moveGoogleTaskToList,
  updateGoogleTask,
} from "@/lib/google/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json({
      connected: false,
      hasTasksScope: false,
      lists: [],
      tasks: [],
    });
  }
  const hasTasksScope = hasGoogleTasksScope(userId);
  if (!hasTasksScope) {
    return NextResponse.json({
      connected: true,
      hasTasksScope: false,
      lists: [],
      tasks: [],
    });
  }
  try {
    const { searchParams } = new URL(request.url);
    const horizon = Number(searchParams.get("horizon") || 7);
    const managed = searchParams.get("managed") === "1";
    const includeCompleted = searchParams.get("includeCompleted") === "1";
    const [lists, tasks] = await Promise.all([
      listGoogleTaskLists(userId, request),
      managed
        ? listManagedGoogleTasks(userId, {
            horizonDays: Number.isFinite(horizon) ? horizon : 45,
            includeCompleted,
            request,
          })
        : listUpcomingGoogleTasks(userId, {
            horizonDays: Number.isFinite(horizon) ? horizon : 7,
            request,
          }),
    ]);
    return NextResponse.json({
      connected: true,
      hasTasksScope: true,
      lists,
      tasks,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tasklistId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google-Konto nicht verbunden." },
      { status: 400 }
    );
  }
  if (!hasGoogleTasksScope(userId)) {
    return NextResponse.json(
      { error: "Tasks-Recht fehlt — bitte unter Konto neu verbinden." },
      { status: 403 }
    );
  }
  try {
    const body = CreateBody.parse(await request.json());
    const task = await createGoogleTask(userId, body, request);
    return NextResponse.json({ task });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = msg.includes("Zod") || msg.includes("parse") ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

const PatchBody = z.object({
  taskId: z.string().min(1).max(200),
  listId: z.string().min(1).max(200),
  status: z.enum(["needsAction", "completed"]).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /** Ziel-Liste (Liste wechseln). */
  targetListId: z.string().min(1).max(200).optional(),
});

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google-Konto nicht verbunden." },
      { status: 400 }
    );
  }
  if (!hasGoogleTasksScope(userId)) {
    return NextResponse.json(
      { error: "Tasks-Recht fehlt — bitte unter Konto neu verbinden." },
      { status: 403 }
    );
  }

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  if (
    body.status === undefined &&
    body.dueDate === undefined &&
    !body.targetListId
  ) {
    return NextResponse.json(
      { error: "status, dueDate oder targetListId erforderlich." },
      { status: 400 }
    );
  }

  try {
    if (body.targetListId && body.targetListId !== body.listId) {
      const task = await moveGoogleTaskToList(
        userId,
        {
          taskId: body.taskId,
          listId: body.listId,
          targetListId: body.targetListId,
        },
        request
      );
      // Optional due/status after move
      if (body.status !== undefined || body.dueDate !== undefined) {
        const updated = await updateGoogleTask(
          userId,
          {
            taskId: task.id,
            listId: task.listId,
            status: body.status,
            dueDate: body.dueDate,
          },
          request
        );
        return NextResponse.json({
          ok: true,
          task: { ...updated, listTitle: task.listTitle },
        });
      }
      return NextResponse.json({ ok: true, task });
    }

    const task = await updateGoogleTask(
      userId,
      {
        taskId: body.taskId,
        listId: body.listId,
        status: body.status,
        dueDate: body.dueDate,
      },
      request
    );
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google Task konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}
