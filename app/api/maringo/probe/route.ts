import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError, mariSql, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        error:
          "MARI nicht konfiguriert. Bitte Benutzer, Passwort und Personalnummer speichern.",
      },
      { status: 400 }
    );
  }

  try {
    const cfg = requireMariConfig();
    const rows = await mariSql<{ C: number }>(
      `SELECT COUNT(*) AS "C" FROM "MARISupportIssue" WHERE "HandledBy"='${cfg.employeeNumber.replace(/'/g, "''")}' AND "EditorType"=3 AND "HotlineClassType"=17`
    );
    const count = Number(rows[0]?.C ?? 0);
    return NextResponse.json({
      ok: true,
      message: `Login OK · Personalnummer ${cfg.employeeNumber} · ${count} Support-Tickets (Klasse 17, alle Status).`,
      employeeNumber: cfg.employeeNumber,
      ticketCount: count,
    });
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
