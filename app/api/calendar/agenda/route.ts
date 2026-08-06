import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  getCalendarAgenda,
  type CalendarAgendaRange,
} from "@/lib/calendar/agenda-feed";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRange(raw: string | null): CalendarAgendaRange {
  if (raw === "today" || raw === "week" || raw === "14d") return raw;
  return "week";
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams.get("range"));
  const sourcesRaw = searchParams.get("sources");
  // null = alle; "" / list = Filter (leer = nichts)
  const sourceIds =
    sourcesRaw === null
      ? null
      : sourcesRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  return NextResponse.json(
    await getCalendarAgenda({
      range,
      sourceIds,
      includeWeather: true,
    })
  );
}
