import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { getPrimaryMariCalendarStampForIssue } from "@/lib/mari/calendar-stamp";
import { getTicketDetail, patchTicketFields } from "@/lib/mari/tickets";
import { zurichNowParts } from "@/lib/dashboard/day-briefing";

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
  const auth = await requireModule("maringo");
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
    const calendarStamp = getPrimaryMariCalendarStampForIssue(
      id,
      zurichNowParts().todayIso
    );
    return NextResponse.json({ ticket, calendarStamp });
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
  projectNumber: z.string().trim().max(40).nullable().optional(),
  contractId: z.number().int().nonnegative().nullable().optional(),
  contractPositionId: z.number().int().nonnegative().nullable().optional(),
  activity: z.string().trim().max(250).nullable().optional(),
  /** USER_U_Std_Freigegeben_Kunde — ganze Stunden */
  stdFreigabe: z.number().int().min(0).max(9999).nullable().optional(),
  contactPerson: z.string().trim().max(250).nullable().optional(),
  supportGroupId: z.number().int().nonnegative().nullable().optional(),
  handledBy: z.string().trim().max(20).nullable().optional(),
  medium: z.number().int().nonnegative().nullable().optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireModule("maringo");
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
      projectNumber: parsed.data.projectNumber,
      contractId: parsed.data.contractId,
      contractPositionId: parsed.data.contractPositionId,
      activity: parsed.data.activity,
      stdFreigabe: parsed.data.stdFreigabe,
      contactPerson: parsed.data.contactPerson,
      supportGroupId: parsed.data.supportGroupId,
      handledBy: parsed.data.handledBy,
      medium: parsed.data.medium,
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
