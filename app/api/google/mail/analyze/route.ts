import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  analyzeMicrosoftMailDay,
  emptyMailDayAnalysis,
  type MsDayMailAnalysis,
} from "@/lib/microsoft/analyze-mail-day";
import { listGoogleMailForDay } from "@/lib/google/mail-day";
import {
  cachedToJob,
  finishGoogleMailDayJobError,
  finishGoogleMailDayJobOk,
  getGoogleMailDayCached,
  isGoogleMailDayJobBusy,
  listGoogleMailDayCachedDays,
  readGoogleMailDayJob,
  startGoogleMailDayJob,
  upsertGoogleMailDayCache,
} from "@/lib/google/mail-day-analysis-job";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { zurichYmd } from "@/lib/microsoft/time";
import { formatTokenUsageLine } from "@/lib/ai/usage-cost";
import { notifyAppChange } from "@/lib/realtime/notify";

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

function notifyDone(dayIso: string, analysis: MsDayMailAnalysis) {
  const usageLine = formatTokenUsageLine(analysis.usage);
  const detail = [
    `${analysis.clusters.length} Cluster`,
    `${analysis.tasks.length} Aufgabe(n)`,
    `${analysis.replies.length} Antwort(en)`,
    dayIso,
    usageLine,
  ]
    .filter(Boolean)
    .join(" · ");

  notifyAppChange({
    domain: "documents",
    reason: "buddy_status",
    headline: "Gmail-Tagesanalyse fertig",
    detail,
    title: null,
    href: "/google?tab=day",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "buddy",
  });
}

function notifyError(dayIso: string, message: string) {
  const detail = `${dayIso}: ${message.slice(0, 180)}`;
  notifyAppChange({
    domain: "documents",
    reason: "buddy_status",
    headline: "Gmail-Tagesanalyse fehlgeschlagen",
    detail,
    title: null,
    href: "/google?tab=day",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "buddy",
  });
}

async function runAnalysisJob(userId: number, day: string) {
  try {
    const mail = await listGoogleMailForDay(userId, day);
    if (mail.inbox.length === 0 && mail.sent.length === 0) {
      const analysis = emptyMailDayAnalysis(
        `Keine Gmail-Mails für ${day} gefunden.`
      );
      finishGoogleMailDayJobOk(
        userId,
        mail.dayIso,
        { inbox: mail.inbox, sent: mail.sent, dayIso: mail.dayIso },
        analysis
      );
      notifyDone(mail.dayIso, analysis);
      return;
    }
    const analysis = await analyzeMicrosoftMailDay({
      todayIso: mail.dayIso,
      inbox: mail.inbox,
      sent: mail.sent,
    });
    finishGoogleMailDayJobOk(
      userId,
      mail.dayIso,
      { inbox: mail.inbox, sent: mail.sent, dayIso: mail.dayIso },
      analysis
    );
    notifyDone(mail.dayIso, analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishGoogleMailDayJobError(userId, day, message);
    notifyError(day, message);
  }
}

/** Status / Cache für Tag (überlebt Seitenwechsel, max. 7 Tage). */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google Workspace nicht verbunden." },
      { status: 400 }
    );
  }
  const url = new URL(request.url);
  const day = url.searchParams.get("date")?.trim() || null;
  const cachedDays = listGoogleMailDayCachedDays(userId);
  const job = readGoogleMailDayJob(userId);

  if (job?.status === "running" && isGoogleMailDayJobBusy(job)) {
    return NextResponse.json({
      ok: true,
      status: "running",
      job,
      cachedDays,
      fromCache: false,
      cachedJob:
        day && job.dayIso !== day
          ? (() => {
              const c = getGoogleMailDayCached(userId, day);
              return c ? cachedToJob(userId, c) : null;
            })()
          : null,
    });
  }

  if (job?.status === "running" && !isGoogleMailDayJobBusy(job)) {
    const cached = day ? getGoogleMailDayCached(userId, day) : null;
    if (cached) {
      return NextResponse.json({
        ok: true,
        status: "done",
        job: cachedToJob(userId, cached),
        cachedDays,
        fromCache: true,
        stale: true,
      });
    }
    return NextResponse.json({
      ok: true,
      status: "idle",
      job: {
        ...job,
        status: "error",
        error: job.error || "Analyse abgebrochen oder Timeout.",
        finishedAt: new Date().toISOString(),
      },
      cachedDays,
      stale: true,
    });
  }

  if (
    job?.status === "done" &&
    job.analysis &&
    (!day || job.dayIso === day)
  ) {
    if (job.finishedAt) {
      upsertGoogleMailDayCache(userId, {
        dayIso: job.dayIso,
        finishedAt: job.finishedAt,
        analysis: job.analysis,
        inboxCount: job.mail?.inbox.length ?? 0,
        sentCount: job.mail?.sent.length ?? 0,
      });
    }
    return NextResponse.json({
      ok: true,
      status: "done",
      job,
      cachedDays: listGoogleMailDayCachedDays(userId),
      fromCache: false,
    });
  }

  if (day) {
    const cached = getGoogleMailDayCached(userId, day);
    if (cached) {
      return NextResponse.json({
        ok: true,
        status: "done",
        job: cachedToJob(userId, cached),
        cachedDays,
        fromCache: true,
      });
    }
    return NextResponse.json({
      ok: true,
      status: "idle",
      job: null,
      cachedDays,
      fromCache: false,
    });
  }

  if (job?.status === "done" && job.analysis) {
    return NextResponse.json({
      ok: true,
      status: "done",
      job,
      cachedDays,
      fromCache: false,
    });
  }
  const latestDay = cachedDays[0];
  if (latestDay) {
    const cached = getGoogleMailDayCached(userId, latestDay);
    if (cached) {
      return NextResponse.json({
        ok: true,
        status: "done",
        job: cachedToJob(userId, cached),
        cachedDays,
        fromCache: true,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    status: "idle",
    job: null,
    cachedDays,
    fromCache: false,
  });
}

/** Startet Analyse im Hintergrund (after) und antwortet sofort. */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google Workspace nicht verbunden." },
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

  const existing = readGoogleMailDayJob(userId);
  if (isGoogleMailDayJobBusy(existing)) {
    return NextResponse.json(
      {
        ok: true,
        accepted: false,
        status: "running",
        job: existing,
        cachedDays: listGoogleMailDayCachedDays(userId),
        message: `Analyse läuft bereits (${existing!.dayIso}).`,
      },
      { status: 202 }
    );
  }

  const job = startGoogleMailDayJob(userId, day);
  after(() => {
    void runAnalysisJob(userId, day);
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      status: "running",
      job,
      cachedDays: listGoogleMailDayCachedDays(userId),
      message: `Analyse für ${day} gestartet.`,
    },
    { status: 202 }
  );
}
