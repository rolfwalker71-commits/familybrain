import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listMariMedia, listMariPriorities } from "@/lib/mari/ticket-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ticketkopf-Lookups: Prioritäten + Kommunikationskanäle (Medium). */
export async function GET() {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        error: "MARI nicht konfiguriert.",
        configured: false,
        priorities: [],
        media: [],
      },
      { status: 503 }
    );
  }

  try {
    const [priorities, media] = await Promise.all([
      listMariPriorities(),
      listMariMedia(),
    ]);
    return NextResponse.json({ configured: true, priorities, media });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json(
      { error: message, priorities: [], media: [] },
      { status }
    );
  }
}
