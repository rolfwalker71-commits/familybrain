import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listActivityLog } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  entityType: z.enum([
    "document",
    "trip_event",
    "finance_expense",
    "trip",
    "finance_ledger",
  ]),
  entityId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    entityType: url.searchParams.get("entityType"),
    entityId: url.searchParams.get("entityId"),
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  // Document activity is admin-oriented; trip/expense ok for shared users.
  if (parsed.data.entityType === "document" && !auth.isAdmin) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const data = listActivityLog(parsed.data);
  return NextResponse.json(data);
}
