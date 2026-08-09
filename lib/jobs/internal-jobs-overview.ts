import { getSetting } from "@/lib/db/migrations";
import { getDriveMirrorStatus } from "@/lib/buddy/drive-mirror";
import {
  getSchedulerSettings,
  getActiveJobRun,
} from "@/lib/jobs/queries";
import { getSchedulerRuntimeStatus } from "@/lib/jobs/scheduler";
import { jobTypeLabel } from "@/lib/jobs/constants";
import {
  MAIL_AI_LAST_SYNC_KEY,
  MAIL_AI_SYNC_INTERVAL_MS,
} from "@/lib/mail/sync-mail-if-due";
import {
  AGENDA_AI_LAST_SYNC_KEY,
  AGENDA_AI_SYNC_INTERVAL_MS,
} from "@/lib/dashboard/sync-agenda-ai-icons-if-due";
import {
  getO365PdfBackfillStatus,
  isO365PdfBackfillEnabled,
} from "@/lib/microsoft/mail-paperless-backfill";
import {
  getO365PdfLiveStatus,
  isO365PdfLiveEnabled,
} from "@/lib/microsoft/mail-paperless-live";
import { isZurichWeekday } from "@/lib/dashboard/day-close-ritual";
import { zurichNowParts } from "@/lib/dashboard/day-briefing";

export type InternalJobState =
  | "active"
  | "due"
  | "scheduled"
  | "idle"
  | "off"
  | "blocked";

export type InternalJobRow = {
  id: string;
  label: string;
  enabled: boolean;
  state: InternalJobState;
  /** ISO timestamp when known; null if none / idle / off */
  nextAt: string | null;
  detail?: string | null;
  href?: string | null;
};

function addMs(iso: string | null | undefined, ms: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + ms).toISOString();
}

/** Zurich calendar ymd + hm → UTC ISO (iterative offset fix). */
function zurichWallClockToIso(
  ymd: string,
  hour: number,
  minute: number
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  let utcMs = Date.parse(`${ymd}T${pad(hour)}:${pad(minute)}:00.000Z`);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utcMs));
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value || "00";
    const gotYmd = `${get("year")}-${get("month")}-${get("day")}`;
    const gotMins = Number(get("hour")) * 60 + Number(get("minute"));
    const wantMins = hour * 60 + minute;
    let dayDelta = 0;
    if (gotYmd < ymd) dayDelta = 1;
    else if (gotYmd > ymd) dayDelta = -1;
    const diffMins = dayDelta * 24 * 60 + (wantMins - gotMins);
    if (diffMins === 0) break;
    utcMs += diffMins * 60_000;
  }
  return new Date(utcMs).toISOString();
}

function addDaysYmdLocal(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

/**
 * Next briefing push opportunity (morning 07:00 or evening window start).
 */
export function nextBriefingPushAt(now = new Date()): string | null {
  const morningSent = getSetting("day_briefing_last_sent_date");
  const eveningSent = getSetting("evening_digest_last_sent_date");
  const { todayIso: ymd, hour, minute } = zurichNowParts(now);
  const weekday = isZurichWeekday(ymd);
  const nowMins = hour * 60 + minute;
  const morningStart = 7 * 60;
  const eveningStart = weekday ? 18 * 60 + 30 : 19 * 60 + 45;

  if (morningSent !== ymd && nowMins < 9 * 60 + 30) {
    if (nowMins < morningStart) {
      return zurichWallClockToIso(ymd, 7, 0);
    }
    return now.toISOString(); // due / in window
  }
  if (eveningSent !== ymd) {
    if (nowMins < eveningStart) {
      const eh = Math.floor(eveningStart / 60);
      const em = eveningStart % 60;
      return zurichWallClockToIso(ymd, eh, em);
    }
    const eveningEnd = weekday ? 19 * 60 + 30 : 21 * 60 + 30;
    if (nowMins < eveningEnd) return now.toISOString();
  }
  const tomorrow = addDaysYmdLocal(ymd, 1);
  return zurichWallClockToIso(tomorrow, 7, 0);
}

function stateFromNext(
  nextAt: string | null,
  enabled: boolean,
  opts?: { active?: boolean; idle?: boolean; blocked?: boolean }
): InternalJobState {
  if (opts?.blocked) return "blocked";
  if (!enabled) return "off";
  if (opts?.active) return "active";
  if (opts?.idle) return "idle";
  if (!nextAt) return "idle";
  const t = new Date(nextAt).getTime();
  if (!Number.isFinite(t)) return "idle";
  if (t <= Date.now() + 15_000) return "due";
  return "scheduled";
}

/** Periodic / scheduler-driven internal jobs for status UI. */
export function listInternalJobsOverview(now = new Date()): InternalJobRow[] {
  const settings = getSchedulerSettings();
  const runtime = getSchedulerRuntimeStatus();
  const active = getActiveJobRun();
  const tickAt = settings.enabled ? runtime.nextTickAt : null;

  const rows: InternalJobRow[] = [];

  rows.push({
    id: "scheduler",
    label: "Scheduler-Tick",
    enabled: settings.enabled,
    state: stateFromNext(tickAt, settings.enabled, {
      active: runtime.ticking,
    }),
    nextAt: tickAt,
    detail: settings.enabled
      ? `Intervall ${settings.intervalMinutes} Min`
      : "Scheduler aus",
    href: "/sync?tab=automation",
  });

  rows.push({
    id: "sync_analyze",
    label: "Sync & Analyse",
    enabled: settings.enabled,
    state: stateFromNext(tickAt, settings.enabled, {
      active: active?.job_type === "sync_analyze",
    }),
    nextAt: tickAt,
    detail:
      active?.job_type === "sync_analyze"
        ? `Läuft · ${jobTypeLabel(active.job_type)}`
        : "Beim nächsten Tick",
    href: "/sync?tab=automation",
  });

  const drive = getDriveMirrorStatus();
  const driveActive = active?.job_type === "drive_mirror";
  const driveWillRun =
    drive.enabled && drive.hasDriveScope && drive.pending > 0 && settings.enabled;
  rows.push({
    id: "drive_mirror",
    label: "Drive-Spiegel",
    enabled: drive.enabled,
    state: stateFromNext(driveWillRun ? tickAt : null, drive.enabled, {
      active: driveActive,
      idle: drive.enabled && (!driveWillRun || drive.complete),
    }),
    nextAt: driveWillRun ? tickAt : null,
    detail: !drive.enabled
      ? "Aus"
      : drive.complete
        ? `Fertig · ${drive.mirrored}/${drive.totalDocuments}`
        : `${drive.pending} ausstehend · ${drive.percent}%`,
    href: "/account",
  });

  const backfill = getO365PdfBackfillStatus();
  const backfillOn = isO365PdfBackfillEnabled();
  const backfillActive =
    active?.job_type === "o365_pdf_backfill" || Boolean(backfill.live?.active);
  rows.push({
    id: "o365_pdf_backfill",
    label: "O365 Catch-up",
    enabled: backfillOn || backfill.hasCursor,
    state: backfillOn || backfillActive
      ? backfillActive
        ? "active"
        : "due"
      : backfill.hasCursor
        ? "idle"
        : "off",
    nextAt: backfillOn ? now.toISOString() : null,
    detail: backfillOn
      ? backfill.reachedYmd
        ? `Aktiv · erreicht ${backfill.reachedYmd}`
        : "Aktiv · verkettet"
      : backfill.hasCursor
        ? "Pausiert · Cursor bleibt"
        : backfill.complete
          ? "Crawl fertig"
          : "Aus",
    href: "/account",
  });

  const live = getO365PdfLiveStatus();
  const liveEnabled = isO365PdfLiveEnabled();
  const liveBlocked = live.blockedByBackfill;
  let liveNext: string | null = null;
  if (liveEnabled && !liveBlocked) {
    const last = live.lastAttemptAt;
    liveNext = last
      ? addMs(last, live.intervalMinutes * 60_000)
      : now.toISOString();
    if (liveNext && new Date(liveNext).getTime() < now.getTime()) {
      liveNext = now.toISOString();
    }
  }
  rows.push({
    id: "o365_pdf_live",
    label: "O365 Live-Import",
    enabled: liveEnabled,
    state: stateFromNext(liveNext, liveEnabled, {
      active: active?.job_type === "o365_pdf_live",
      blocked: liveBlocked && liveEnabled,
    }),
    nextAt: liveBlocked ? null : liveNext,
    detail: !liveEnabled
      ? "Aus (opt-in)"
      : liveBlocked
        ? "Wartet auf Catch-up"
        : `Alle ${live.intervalMinutes} Min`,
    href: "/account",
  });

  const mailLast = getSetting(MAIL_AI_LAST_SYNC_KEY);
  const mailNext = mailLast
    ? addMs(mailLast, MAIL_AI_SYNC_INTERVAL_MS)
    : settings.enabled
      ? tickAt || now.toISOString()
      : null;
  const mailDue =
    mailNext != null && new Date(mailNext).getTime() <= now.getTime();
  rows.push({
    id: "mail_ai",
    label: "Mail-AI",
    enabled: true,
    state: stateFromNext(
      mailDue ? now.toISOString() : mailNext,
      true
    ),
    nextAt: mailDue ? now.toISOString() : mailNext,
    detail: "Throttle 15 Min · beim Scheduler-Tick",
    href: "/sync?tab=automation",
  });

  const agendaLast = getSetting(AGENDA_AI_LAST_SYNC_KEY);
  const agendaNext = agendaLast
    ? addMs(agendaLast, AGENDA_AI_SYNC_INTERVAL_MS)
    : settings.enabled
      ? tickAt || now.toISOString()
      : null;
  const agendaDue =
    agendaNext != null && new Date(agendaNext).getTime() <= now.getTime();
  rows.push({
    id: "agenda_icons",
    label: "Agenda-Icons",
    enabled: true,
    state: stateFromNext(
      agendaDue ? now.toISOString() : agendaNext,
      true
    ),
    nextAt: agendaDue ? now.toISOString() : agendaNext,
    detail: "Throttle 20 Min · abends Morgen-Vorbereitung",
    href: "/sync?tab=automation",
  });

  const briefingNext = nextBriefingPushAt(now);
  const morningSent = getSetting("day_briefing_last_sent_date");
  const eveningSent = getSetting("evening_digest_last_sent_date");
  const today = zurichNowParts(now).todayIso;
  rows.push({
    id: "briefing_push",
    label: "Briefing-Push",
    enabled: settings.enabled,
    state: stateFromNext(briefingNext, settings.enabled),
    nextAt: settings.enabled ? briefingNext : null,
    detail:
      morningSent === today && eveningSent === today
        ? "Heute Morgen + Abend erledigt"
        : morningSent === today
          ? "Morgen erledigt · Abend steht aus"
          : "Morgen- und/oder Abendfenster",
    href: "/sync?tab=automation",
  });

  return rows;
}
