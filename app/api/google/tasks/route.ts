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
  listUpcomingGoogleTasks,
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
    const [lists, tasks] = await Promise.all([
      listGoogleTaskLists(userId, request),
      listUpcomingGoogleTasks(userId, {
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
