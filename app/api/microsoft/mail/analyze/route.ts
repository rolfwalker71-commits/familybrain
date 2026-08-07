import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  analyzeMicrosoftMailDay,
  emptyMailDayAnalysis,
} from "@/lib/microsoft/analyze-mail-day";
import { listMicrosoftMailForDay } from "@/lib/microsoft/mail-day";
import {
  finishMsMailDayJobError,
  finishMsMailDayJobOk,
  isMsMailDayJobBusy,
  readMsMailDayJob,
  startMsMailDayJob,
} from "@/lib/microsoft/mail-day-analysis-job";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { publishRealtime } from "@/lib/realtime/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

function notifyDone(dayIso: string, clusters: number, tasks: number) {
  publishRealtime({
    topic: "notify",
    at: new Date().toISOString(),
    notification: {
      domain: "documents",
      reason: "buddy_status",
      headline: "Mail-Tagesanalyse fertig",
      detail: `${clusters} Cluster · ${tasks} Aufgabe(n) · ${dayIso}`,
      title: null,
      href: "/microsoft",
      aiIconUrl: null,
      category: null,
      meta: null,
      source: "buddy",
    },
  });
}

function notifyError(dayIso: string, message: string) {
  publishRealtime({
    topic: "notify",
    at: new Date().toISOString(),
    notification: {
      domain: "documents",
      reason: "buddy_status",
      headline: "Mail-Tagesanalyse fehlgeschlagen",
      detail: `${dayIso}: ${message.slice(0, 180)}`,
      title: null,
      href: "/microsoft",
      aiIconUrl: null,
      category: null,
      meta: null,
      source: "buddy",
    },
  });
}

async function runAnalysisJob(userId: number, day: string) {
  try {
    const mail = await listMicrosoftMailForDay(userId, day);
    if (mail.inbox.length === 0 && mail.sent.length === 0) {
      const analysis = emptyMailDayAnalysis(
        `Keine Outlook-Mails für ${day} gefunden.`
      );
      finishMsMailDayJobOk(
        userId,
        mail.dayIso,
        { inbox: mail.inbox, sent: mail.sent, dayIso: mail.dayIso },
        analysis
      );
      notifyDone(mail.dayIso, 0, 0);
      return;
    }
    const analysis = await analyzeMicrosoftMailDay({
      todayIso: mail.dayIso,
      inbox: mail.inbox,
      sent: mail.sent,
    });
    finishMsMailDayJobOk(
      userId,
      mail.dayIso,
      { inbox: mail.inbox, sent: mail.sent, dayIso: mail.dayIso },
      analysis
    );
    notifyDone(
      mail.dayIso,
      analysis.clusters.length,
      analysis.tasks.length
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishMsMailDayJobError(userId, day, message);
    notifyError(day, message);
  }
}

/** Status / letztes Ergebnis (überlebt Seitenwechsel). */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  const url = new URL(request.url);
  const day = url.searchParams.get("date")?.trim() || null;
  const job = readMsMailDayJob(userId);
  if (!job) {
    return NextResponse.json({
      ok: true,
      status: "idle",
      job: null,
    });
  }
  // Veraltetes running als idle behandeln für Client-Polling
  if (job.status === "running" && !isMsMailDayJobBusy(job)) {
    return NextResponse.json({
      ok: true,
      status: "idle",
      job: {
        ...job,
        status: "error",
        error: job.error || "Analyse abgebrochen oder Timeout.",
        finishedAt: new Date().toISOString(),
      },
      stale: true,
    });
  }
  if (day && job.dayIso !== day && job.status === "done") {
    return NextResponse.json({
      ok: true,
      status: job.status,
      job,
      dayMismatch: true,
    });
  }
  return NextResponse.json({
    ok: true,
    status: job.status,
    job,
  });
}

/** Startet Analyse im Hintergrund (after) und antwortet sofort. */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let day = zurichYmd();
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (parsed.success && parsed.data.date) day = parsed.data.date;
  } catch {
    // empty body ok
  }

  const existing = readMsMailDayJob(userId);
  if (isMsMailDayJobBusy(existing)) {
    return NextResponse.json(
      {
        ok: true,
        accepted: false,
        status: "running",
        job: existing,
        message: `Analyse läuft bereits (${existing!.dayIso}).`,
      },
      { status: 202 }
    );
  }

  const job = startMsMailDayJob(userId, day);
  after(() => {
    void runAnalysisJob(userId, day);
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      status: "running",
      job,
      message: `Analyse für ${day} gestartet.`,
    },
    { status: 202 }
  );
}
