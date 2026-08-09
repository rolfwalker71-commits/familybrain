import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  analyzeMicrosoftMailDay,
  emptyMailDayAnalysis,
  type MsDayMailAnalysis,
} from "@/lib/microsoft/analyze-mail-day";
import { listGoogleMailForRange } from "@/lib/google/mail-day";
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
  formatMailAnalysisRangeLabel,
  resolveMailAnalysisRange,
  type MailAnalysisRange,
} from "@/lib/mail/mail-analysis-range";
import { attachExistingTasksToAnalysis } from "@/lib/mail/day-task-catalog";
import { listGoogleTasksForMatch } from "@/lib/google/tasks";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { formatTokenUsageLine } from "@/lib/ai/usage-cost";
import { notifyAppChange } from "@/lib/realtime/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

const BodySchema = z.object({
  date: Ymd,
  from: Ymd,
  to: Ymd,
});

function notifyDone(rangeLabel: string, analysis: MsDayMailAnalysis) {
  const usageLine = formatTokenUsageLine(analysis.usage);
  const detail = [
    `${analysis.clusters.length} Cluster`,
    `${analysis.tasks.length} Aufgabe(n)`,
    `${analysis.replies.length} Antwort(en)`,
    rangeLabel,
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

function notifyError(rangeLabel: string, message: string) {
  const detail = `${rangeLabel}: ${message.slice(0, 180)}`;
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

async function runAnalysisJob(userId: number, range: MailAnalysisRange) {
  const label = formatMailAnalysisRangeLabel(range);
  try {
    const mail = await listGoogleMailForRange(
      userId,
      range.fromYmd,
      range.toYmd
    );
    const mailPayload = {
      inbox: mail.inbox,
      sent: mail.sent,
      dayIso: mail.dayIso,
      fromYmd: mail.fromYmd,
      toYmd: mail.toYmd,
      rangeKey: mail.rangeKey,
    };
    if (mail.inbox.length === 0 && mail.sent.length === 0) {
      const analysis = emptyMailDayAnalysis(
        `Keine Gmail-Mails für ${label} gefunden.`
      );
      finishGoogleMailDayJobOk(userId, range, mailPayload, analysis);
      notifyDone(label, analysis);
      return;
    }
    const catalogPromise = listGoogleTasksForMatch(userId).catch(() => []);
    const analysis = await analyzeMicrosoftMailDay({
      todayIso: mail.dayIso,
      fromYmd: mail.fromYmd,
      toYmd: mail.toYmd,
      inbox: mail.inbox,
      sent: mail.sent,
    });
    const enriched = attachExistingTasksToAnalysis(
      analysis,
      await catalogPromise
    );
    finishGoogleMailDayJobOk(userId, range, mailPayload, enriched);
    notifyDone(label, enriched);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishGoogleMailDayJobError(userId, range, message);
    notifyError(label, message);
  }
}

/** Status / Cache für Zeitraum. */
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
  const hasRangeParams =
    url.searchParams.has("from") ||
    url.searchParams.has("to") ||
    url.searchParams.has("date");
  const rangeOrErr = hasRangeParams
    ? resolveMailAnalysisRange({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        date: url.searchParams.get("date")?.trim() || null,
      })
    : null;
  if (rangeOrErr && "error" in rangeOrErr) {
    return NextResponse.json({ error: rangeOrErr.error }, { status: 400 });
  }
  const range = rangeOrErr && !("error" in rangeOrErr) ? rangeOrErr : null;
  const rangeKey = range?.rangeKey ?? null;
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
        rangeKey && job.rangeKey !== rangeKey
          ? (() => {
              const c = getGoogleMailDayCached(userId, rangeKey);
              return c ? cachedToJob(userId, c) : null;
            })()
          : null,
    });
  }

  if (job?.status === "running" && !isGoogleMailDayJobBusy(job)) {
    const cached = rangeKey ? getGoogleMailDayCached(userId, rangeKey) : null;
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
    (!rangeKey || job.rangeKey === rangeKey)
  ) {
    if (job.finishedAt) {
      upsertGoogleMailDayCache(userId, {
        dayIso: job.dayIso,
        fromYmd: job.fromYmd,
        toYmd: job.toYmd,
        rangeKey: job.rangeKey,
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

  if (rangeKey) {
    const cached = getGoogleMailDayCached(userId, rangeKey);
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
  const latestKey = cachedDays[0];
  if (latestKey) {
    const cached = getGoogleMailDayCached(userId, latestKey);
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

  let body: z.infer<typeof BodySchema> = {};
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    // empty body ok
  }

  const range = resolveMailAnalysisRange({
    from: body.from,
    to: body.to,
    date: body.date,
  });
  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
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
        message: `Analyse läuft bereits (${formatMailAnalysisRangeLabel({
          fromYmd: existing!.fromYmd,
          toYmd: existing!.toYmd,
        })}).`,
      },
      { status: 202 }
    );
  }

  const job = startGoogleMailDayJob(userId, range);
  after(() => {
    void runAnalysisJob(userId, range);
  });

  const label = formatMailAnalysisRangeLabel(range);
  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      status: "running",
      job,
      cachedDays: listGoogleMailDayCachedDays(userId),
      message: `Analyse für ${label} gestartet.`,
    },
    { status: 202 }
  );
}
