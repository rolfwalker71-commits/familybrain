import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  ensureAgendaAiIcon,
  lookupAgendaAiIconUrl,
  shouldHaveAgendaAiIcon,
  type AgendaIconSubject,
} from "@/lib/dashboard/agenda-ai-icon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BodyItem = AgendaIconSubject & { id?: string };

/**
 * Lookup or generate AI icons for agenda items.
 * Cached by title+type+place so recurring shifts reuse the same image.
 */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const items = (body as { items?: BodyItem[]; force?: boolean })?.items;
  const force = Boolean((body as { force?: boolean })?.force);
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items-Array erforderlich" }, { status: 400 });
  }

  const capped = items.slice(0, 12);
  const byId: Record<string, { key: string; url: string }> = {};
  const byKey: Record<string, string> = {};
  let generated = 0;
  // Tasks oft einzeln angefragt — etwas mehr Generierungen erlauben
  const hasTask = capped.some((i) => String(i.kind || "") === "task");
  const maxGenerate = force ? 6 : hasTask ? 5 : 3;

  for (const item of capped) {
    if (!shouldHaveAgendaAiIcon(item)) continue;
    const subject: AgendaIconSubject = {
      title: item.title,
      location: item.location,
      description: item.description,
      calendarType: item.calendarType,
      kind: item.kind,
      calendarName: item.calendarName,
      meetUrl: item.meetUrl,
      time: item.time,
      endTime: item.endTime,
      driveMinutes: item.driveMinutes ?? null,
      distanceKm: item.distanceKm ?? null,
      coords: item.coords
        ? { lat: item.coords.lat, lon: item.coords.lon }
        : null,
    };

    const existing = lookupAgendaAiIconUrl(subject);
    if (existing && !force) {
      byKey[existing.key] = existing.url;
      if (item.id) byId[item.id] = existing;
      continue;
    }

    if (!hasOpenAIKey() && !existing) continue;
    if (generated >= maxGenerate && !existing) continue;

    try {
      const result = await ensureAgendaAiIcon(subject, { force });
      if (!result) continue;
      if (result.generated) generated += 1;
      byKey[result.key] = result.url;
      if (item.id) byId[item.id] = { key: result.key, url: result.url };
    } catch (err) {
      console.warn(
        "[agenda-ai-icon]",
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({
    byId,
    byKey,
    generated,
    openaiConfigured: hasOpenAIKey(),
  });
}
