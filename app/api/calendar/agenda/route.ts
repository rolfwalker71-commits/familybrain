import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  getCalendarAgenda,
  type CalendarAgendaRange,
} from "@/lib/calendar/agenda-feed";
import { resolveCalendarUserId } from "@/lib/calendar/ics-calendars";
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
  const userId = resolveCalendarUserId(auth);

  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams.get("range"));
  const sourcesRaw = searchParams.get("sources");
  const sourceIds =
    sourcesRaw === null
      ? null
      : sourcesRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  // Default: fast list without geocode/weather/drive. Use enrich=1 to include.
  const includeWeather = searchParams.get("enrich") === "1";

  return NextResponse.json(
    await getCalendarAgenda({
      userId,
      range,
      sourceIds,
      includeWeather,
    })
  );
}
