import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listTimeLinesForTicket } from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", lines: [] },
      { status: 503 }
    );
  }
  try {
    const issueId = Number(
      new URL(request.url).searchParams.get("issueId") || ""
    );
    if (!Number.isInteger(issueId) || issueId <= 0) {
      return NextResponse.json(
        { error: "Parameter issueId erforderlich.", lines: [] },
        { status: 400 }
      );
    }
    const lines = await listTimeLinesForTicket(issueId);
    const totalHours = Math.round(
      lines.reduce((s, l) => s + l.hours, 0) * 100
    ) / 100;
    const billableHours = Math.round(
      lines.reduce((s, l) => s + l.hoursBillable, 0) * 100
    ) / 100;
    return NextResponse.json({
      lines,
      totalHours,
      billableHours,
      nonBillableHours: Math.round((totalHours - billableHours) * 100) / 100,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, lines: [] }, { status });
  }
}
