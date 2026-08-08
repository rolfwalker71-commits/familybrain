import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  analyzeMicrosoftMailDay,
  emptyMailDayAnalysis,
  type MsDayMailAnalysis,
} from "@/lib/microsoft/analyze-mail-day";
import { listMicrosoftMailForDay } from "@/lib/microsoft/mail-day";
import {
  cachedToJob,
  finishMsMailDayJobError,
  finishMsMailDayJobOk,
  getMsMailDayCached,
  isMsMailDayJobBusy,
  listMsMailDayCachedDays,
  readMsMailDayJob,
  startMsMailDayJob,
  upsertMsMailDayCache,
} from "@/lib/microsoft/mail-day-analysis-job";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
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

function notifyDone(
  userId: number,
  dayIso: string,
  analysis: MsDayMailAnalysis
) {
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
    headline: "Mail-Tagesanalyse fertig",
    detail,
    title: null,
    href: "/microsoft",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "buddy",
  });
}

function notifyError(userId: number, dayIso: string, message: string) {
  const detail = `${dayIso}: ${message.slice(0, 180)}`;
  notifyAppChange({
    domain: "documents",
    reason: "buddy_status",
    headline: "Mail-Tagesanalyse fehlgeschlagen",
    detail,
    title: null,
    href: "/microsoft",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "buddy",
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
      notifyDone(userId, mail.dayIso, analysis);
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
    notifyDone(userId, mail.dayIso, analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishMsMailDayJobError(userId, day, message);
    notifyError(userId, day, message);
  }
}

/** Status / Cache für Tag (überlebt Seitenwechsel, max. 7 Tage). */
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
  const cachedDays = listMsMailDayCachedDays(userId);
  const job = readMsMailDayJob(userId);

  if (job?.status === "running" && isMsMailDayJobBusy(job)) {
    const sameDay = !day || job.dayIso === day;
    return NextResponse.json({
      ok: true,
      status: "running",
      job: sameDay ? job : job,
      cachedDays,
      fromCache: false,
      // Wenn anderer Tag gewählt: Cache für diesen Tag mitliefern
      cachedJob:
        day && job.dayIso !== day
          ? (() => {
              const c = getMsMailDayCached(userId, day);
              return c ? cachedToJob(userId, c) : null;
            })()
          : null,
    });
  }

  // Veraltetes running
  if (job?.status === "running" && !isMsMailDayJobBusy(job)) {
    const cached = day ? getMsMailDayCached(userId, day) : null;
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

  // Aktueller Job passt zum Tag
  if (
    job?.status === "done" &&
    job.analysis &&
    (!day || job.dayIso === day)
  ) {
    // Letzten Job in den Tages-Cache übernehmen (Migration / nach Analyse)
    if (job.finishedAt) {
      upsertMsMailDayCache(userId, {
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
      cachedDays: listMsMailDayCachedDays(userId),
      fromCache: false,
    });
  }

  // Cache-Treffer für angefragten Tag
  if (day) {
    const cached = getMsMailDayCached(userId, day);
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

  // Ohne date: letzten Job oder neuesten Cache
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
    const cached = getMsMailDayCached(userId, latestDay);
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
        cachedDays: listMsMailDayCachedDays(userId),
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
      cachedDays: listMsMailDayCachedDays(userId),
      message: `Analyse für ${day} gestartet.`,
    },
    { status: 202 }
  );
}
