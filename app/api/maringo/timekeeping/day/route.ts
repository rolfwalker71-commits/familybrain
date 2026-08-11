import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import {
  listTimeLinesForDay,
  type MariTimePeriod,
} from "@/lib/mari/timekeeping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIODS = new Set<MariTimePeriod>(["day", "week", "month", "quarter"]);

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert.", configured: false },
      { status: 503 }
    );
  }
  try {
    const params = new URL(request.url).searchParams;
    const date = params.get("date");
    const periodRaw = (params.get("period") || "day").toLowerCase();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Parameter date=YYYY-MM-DD erforderlich." },
        { status: 400 }
      );
    }
    if (!PERIODS.has(periodRaw as MariTimePeriod)) {
      return NextResponse.json(
        { error: "period muss day|week|month|quarter sein." },
        { status: 400 }
      );
    }
    const summary = await listTimeLinesForDay({
      dateYmd: date,
      period: periodRaw as MariTimePeriod,
    });
    return NextResponse.json({ configured: true, ...summary });
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
