import { after, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  beginAgendaAiRegenJob,
  isAgendaAiRegenJobBusy,
  readAgendaAiRegenJob,
  runAgendaAiRegenJob,
} from "@/lib/dashboard/regenerate-cloud-agenda-ai-icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Worker may run longer via `after()`; HTTP returns immediately. */
export const maxDuration = 300;

/**
 * Status of the last / current calendar AI-icon regenerate job.
 */
export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const job = readAgendaAiRegenJob();
  return NextResponse.json({
    ok: true,
    busy: isAgendaAiRegenJobBusy(job),
    job,
  });
}

/**
 * Force-regenerate agenda AI thumbnails for Google + Microsoft calendars
 * (current week). Runs in the background so reverse proxies do not time out
 * with an HTML error page mid-batch.
 */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  if (!hasOpenAIKey()) {
    return NextResponse.json(
      { error: "OpenAI API-Key fehlt (Einstellungen)." },
      { status: 400 }
    );
  }

  let maxGenerate = 24;
  try {
    const body = (await request.json()) as { maxGenerate?: number };
    if (
      typeof body.maxGenerate === "number" &&
      Number.isFinite(body.maxGenerate)
    ) {
      maxGenerate = Math.min(40, Math.max(1, Math.floor(body.maxGenerate)));
    }
  } catch {
    /* empty body ok */
  }

  const existing = readAgendaAiRegenJob();
  if (isAgendaAiRegenJobBusy(existing)) {
    return NextResponse.json(
      {
        ok: true,
        accepted: false,
        status: "running",
        busy: true,
        job: existing,
        message: "Neugenerierung läuft bereits.",
      },
      { status: 202 }
    );
  }

  const job = beginAgendaAiRegenJob({
    maxGenerate,
    userId: auth.userId,
  });

  after(() => {
    void runAgendaAiRegenJob({
      maxGenerate,
      userId: auth.userId,
    });
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      status: "running",
      busy: true,
      job,
      message: "Neugenerierung gestartet — läuft im Hintergrund.",
    },
    { status: 202 }
  );
}
