import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  listMyPlannerTasks,
  listPlannerBuckets,
  updatePlannerTask,
} from "@/lib/microsoft/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  taskId: z.string().min(1).max(200),
  etag: z.string().max(500).optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  bucketId: z.string().min(1).max(80).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/** Mir zugewiesene Planner-Tasks (+ optional Buckets eines Plans). */
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const planId = url.searchParams.get("planId")?.trim() || null;
  const openOnly = url.searchParams.get("openOnly") === "1";

  try {
    if (planId) {
      const buckets = await listPlannerBuckets(userId, planId);
      return NextResponse.json({ ok: true, buckets });
    }
    const tasks = await listMyPlannerTasks(userId, { openOnly });
    return NextResponse.json({ ok: true, tasks });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Planner-Aufgaben konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

/** Erledigen (percentComplete=100) oder in anderen Bucket verschieben. */
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

  if (
    body.percentComplete === undefined &&
    body.bucketId === undefined &&
    body.dueDate === undefined
  ) {
    return NextResponse.json(
      { error: "percentComplete, bucketId oder dueDate erforderlich." },
      { status: 400 }
    );
  }

  try {
    const task = await updatePlannerTask(userId, body);
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Planner-Aufgabe konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}
