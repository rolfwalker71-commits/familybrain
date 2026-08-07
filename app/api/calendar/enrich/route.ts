import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  enrichAgendaWithWeather,
  type AgendaPlaceEnrichment,
} from "@/lib/dashboard/agenda-weather";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EnrichBodyItem = {
  id: string;
  date: string;
  location?: string | null;
};

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const items = (body as { items?: EnrichBodyItem[] })?.items;
  if (!Array.isArray(items)) {
    return NextResponse.json(
      { error: "items-Array erforderlich" },
      { status: 400 }
    );
  }

  const capped = items
    .filter(
      (i) =>
        i &&
        typeof i.id === "string" &&
        typeof i.date === "string" &&
        i.date.length >= 10
    )
    .slice(0, 200)
    .map((i) => ({
      id: i.id,
      date: i.date.slice(0, 10),
      location: typeof i.location === "string" ? i.location : null,
    }));

  if (capped.length === 0) {
    return NextResponse.json({ byId: {} as Record<string, AgendaPlaceEnrichment> });
  }

  const enriched = await enrichAgendaWithWeather(capped);
  const byId: Record<string, AgendaPlaceEnrichment> = {};
  for (const row of enriched) {
    byId[row.id] = {
      weather: row.weather,
      coords: row.coords,
      driveMinutes: row.driveMinutes,
      driveLabel: row.driveLabel,
      mapsUrl: row.mapsUrl,
    };
  }

  return NextResponse.json({ byId });
}
