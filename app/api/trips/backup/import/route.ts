import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  importTravelBrainBackup,
  TRAVELBRAIN_BACKUP_VERSION,
  type TravelBrainBackup,
} from "@/lib/trips/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const body = (await request.json()) as TravelBrainBackup;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Ungültiges Backup" }, { status: 400 });
    }
    if (body.version !== TRAVELBRAIN_BACKUP_VERSION) {
      return NextResponse.json(
        {
          error: `Backup-Version ${String(
            (body as { version?: unknown }).version
          )} wird nicht unterstützt (erwartet ${TRAVELBRAIN_BACKUP_VERSION}).`,
        },
        { status: 400 }
      );
    }
    const result = importTravelBrainBackup(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
