import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  FINANCEBRAIN_BACKUP_VERSION,
  importFinanceBrainBackup,
  type FinanceBrainBackup,
} from "@/lib/finance-brain/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = (await request.json()) as FinanceBrainBackup;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Ungültiges Backup" }, { status: 400 });
    }
    if (body.version !== FINANCEBRAIN_BACKUP_VERSION) {
      return NextResponse.json(
        {
          error: `Backup-Version ${String(
            (body as { version?: unknown }).version
          )} wird nicht unterstützt (erwartet ${FINANCEBRAIN_BACKUP_VERSION}).`,
        },
        { status: 400 }
      );
    }
    const result = importFinanceBrainBackup(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
