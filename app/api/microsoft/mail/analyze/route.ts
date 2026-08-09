import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  analyzeMicrosoftMailDay,
  emptyMailDayAnalysis,
  type MsDayMailAnalysis,
} from "@/lib/microsoft/analyze-mail-day";
import { listMicrosoftMailForRange } from "@/lib/microsoft/mail-day";
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
import {
  formatMailAnalysisRangeLabel,
  resolveMailAnalysisRange,
  type MailAnalysisRange,
} from "@/lib/mail/mail-analysis-range";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
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

function notifyError(rangeLabel: string, message: string) {
  const detail = `${rangeLabel}: ${message.slice(0, 180)}`;
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

async function runAnalysisJob(userId: number, range: MailAnalysisRange) {
  const label = formatMailAnalysisRangeLabel(range);
  try {
    const mail = await listMicrosoftMailForRange(
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
        `Keine Outlook-Mails für ${label} gefunden.`
      );
      finishMsMailDayJobOk(userId, range, mailPayload, analysis);
      notifyDone(label, analysis);
      return;
    }
    const analysis = await analyzeMicrosoftMailDay({
      todayIso: mail.dayIso,
      fromYmd: mail.fromYmd,
      toYmd: mail.toYmd,
      inbox: mail.inbox,
      sent: mail.sent,
    });
    finishMsMailDayJobOk(userId, range, mailPayload, analysis);
    notifyDone(label, analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishMsMailDayJobError(userId, range, message);
    notifyError(label, message);
  }
}

function resolveRangeFromRequest(url: URL, body?: z.infer<typeof BodySchema>) {
  return resolveMailAnalysisRange({
    from: body?.from ?? url.searchParams.get("from"),
    to: body?.to ?? url.searchParams.get("to"),
    date: body?.date ?? url.searchParams.get("date")?.trim() ?? null,
  });
}

/** Status / Cache für Zeitraum (überlebt Seitenwechsel, max. 7 Einträge). */
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
  const hasRangeParams =
    url.searchParams.has("from") ||
    url.searchParams.has("to") ||
    url.searchParams.has("date");
  const rangeOrErr = hasRangeParams
    ? resolveRangeFromRequest(url)
    : null;
  if (rangeOrErr && "error" in rangeOrErr) {
    return NextResponse.json({ error: rangeOrErr.error }, { status: 400 });
  }
  const range = rangeOrErr && !("error" in rangeOrErr) ? rangeOrErr : null;
  const rangeKey = range?.rangeKey ?? null;
  const cachedDays = listMsMailDayCachedDays(userId);
  const job = readMsMailDayJob(userId);

  if (job?.status === "running" && isMsMailDayJobBusy(job)) {
    return NextResponse.json({
      ok: true,
      status: "running",
      job,
      cachedDays,
      fromCache: false,
      cachedJob:
        rangeKey && job.rangeKey !== rangeKey
          ? (() => {
              const c = getMsMailDayCached(userId, rangeKey);
              return c ? cachedToJob(userId, c) : null;
            })()
          : null,
    });
  }

  if (job?.status === "running" && !isMsMailDayJobBusy(job)) {
    const cached = rangeKey ? getMsMailDayCached(userId, rangeKey) : null;
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
      upsertMsMailDayCache(userId, {
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
      cachedDays: listMsMailDayCachedDays(userId),
      fromCache: false,
    });
  }

  if (rangeKey) {
    const cached = getMsMailDayCached(userId, rangeKey);
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
    const cached = getMsMailDayCached(userId, latestKey);
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

  const existing = readMsMailDayJob(userId);
  if (isMsMailDayJobBusy(existing)) {
    return NextResponse.json(
      {
        ok: true,
        accepted: false,
        status: "running",
        job: existing,
        cachedDays: listMsMailDayCachedDays(userId),
        message: `Analyse läuft bereits (${formatMailAnalysisRangeLabel({
          fromYmd: existing!.fromYmd,
          toYmd: existing!.toYmd,
        })}).`,
      },
      { status: 202 }
    );
  }

  const job = startMsMailDayJob(userId, range);
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
      cachedDays: listMsMailDayCachedDays(userId),
      message: `Analyse für ${label} gestartet.`,
    },
    { status: 202 }
  );
}
