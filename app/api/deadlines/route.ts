import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import {
  listDeadlines,
  updateDeadline,
  updateDeadlineStatus,
} from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  return NextResponse.json({ deadlines: listDeadlines(status) });
}

const PatchSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["open", "completed"]).optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  deadlineDate: z.string().nullable().optional(),
  deadlineType: z.string().max(100).nullable().optional(),
  snoozedUntil: z.string().nullable().optional(),
  snoozeDays: z.number().int().positive().max(365).optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { id, snoozeDays, ...rest } = parsed.data;
  let snoozedUntil = rest.snoozedUntil;
  if (snoozeDays != null) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + snoozeDays);
    snoozedUntil = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }

  if (
    rest.title !== undefined ||
    rest.description !== undefined ||
    rest.deadlineDate !== undefined ||
    rest.deadlineType !== undefined ||
    snoozedUntil !== undefined ||
    snoozeDays != null
  ) {
    updateDeadline(id, {
      title: rest.title,
      description: rest.description,
      deadlineDate: rest.deadlineDate,
      deadlineType: rest.deadlineType,
      status: rest.status,
      snoozedUntil: snoozedUntil === undefined ? undefined : snoozedUntil,
      manualOverride: true,
    });
  } else if (rest.status) {
    updateDeadlineStatus(id, rest.status);
  } else {
    return NextResponse.json({ error: "Keine Änderungen" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
