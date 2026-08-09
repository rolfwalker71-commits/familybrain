import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { getTicketDetail, patchTicketFields } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (!id) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  try {
    const ticket = await getTicketDetail(id);
    return NextResponse.json({ ticket });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

const PatchSchema = z.object({
  status: z.number().int().positive().optional(),
  priority: z.number().int().positive().optional(),
  dueDate: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+)?$/),
      z.null(),
      z.literal(""),
    ])
    .optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (!id) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingabe", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const ticket = await patchTicketFields(id, {
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate:
        parsed.data.dueDate === "" ? null : parsed.data.dueDate,
    });
    return NextResponse.json({ ok: true, ticket });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
