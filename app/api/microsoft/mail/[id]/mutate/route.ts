import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftMailScope,
  hasMicrosoftTasksScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { mutateMicrosoftMessage } from "@/lib/microsoft/mail-message-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  action: z.enum([
    "markRead",
    "markUnread",
    "archive",
    "delete",
    "flag",
    "unflag",
    "createTodo",
  ]),
  todoTitle: z.string().max(200).nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export async function POST(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
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

  if (body.action === "createTodo" && !hasMicrosoftTasksScope(userId)) {
    return NextResponse.json(
      { error: "Tasks-Recht fehlt (Tasks.ReadWrite)." },
      { status: 403 }
    );
  }

  try {
    const result = await mutateMicrosoftMessage(userId, id, body.action, {
      todoTitle: body.todoTitle,
      dueDate: body.dueDate,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Mail-Aktion fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
