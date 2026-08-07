import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { syncMailAnalysesIfDue } from "@/lib/mail/sync-mail-if-due";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manual / admin kick for background mail AI sync. */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = (await request.json().catch(() => null)) as {
    force?: boolean;
  } | null;

  const summary = await syncMailAnalysesIfDue({
    force: body?.force !== false,
  });
  return NextResponse.json(summary);
}
