import {
  ANALYSIS_CLAIM_LEASE_MS,
  INITIAL_RETRY_INTERVAL_MS,
  JOB_LEASE_MS,
} from "./constants";
import {
  getInitialIngestionComplete,
  getSchedulerSettings,
  recoverExpiredAnalysisClaims,
  recoverExpiredJobLeases,
} from "./queries";
import { runSyncAnalyzeJob } from "./runner";

type SchedulerState = {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  tickTimer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastTickAt: string | null;
  nextTickAt: string | null;
  lastResult: string | null;
};

const globalKey = "__familybrain_scheduler__";

function getState(): SchedulerState {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: SchedulerState;
  };
  if (!g[globalKey]) {
    g[globalKey] = {
      started: false,
      timer: null,
      tickTimer: null,
      running: false,
      lastTickAt: null,
      nextTickAt: null,
      lastResult: null,
    };
  }
  return g[globalKey]!;
}

async function tick(): Promise<void> {
  const state = getState();
  if (state.running) return;

  const settings = getSchedulerSettings();

  if (!settings.enabled) {
    state.lastResult = "disabled";
    return;
  }

  state.running = true;
  state.lastTickAt = new Date().toISOString();
  try {
    const result = await runSyncAnalyzeJob("schedule");
    if (!result.ok) {
      state.lastResult = `skipped:${result.reason}`;
    } else if (result.status === "error") {
      state.lastResult = `error:${result.error ?? "unknown"}`;
    } else {
      state.lastResult = `success:run-${result.runId}`;
    }

    const { syncMailAnalysesIfDue } = await import(
      "@/lib/mail/sync-mail-if-due"
    );
    const mailSync = await syncMailAnalysesIfDue().catch((error) => {
      console.warn("[scheduler] mail sync:", error);
      return null;
    });
    if (mailSync?.attempted && mailSync.sync) {
      state.lastResult = `${state.lastResult}|mail:ai${mailSync.sync.analyzed}`;
    }

    try {
      const { syncAgendaAiIconsIfDue } = await import(
        "@/lib/dashboard/sync-agenda-ai-icons-if-due"
      );
      const iconSync = await syncAgendaAiIconsIfDue().catch((error) => {
        console.warn("[scheduler] agenda ai icons:", error);
        return null;
      });
      if (iconSync?.attempted) {
        state.lastResult = `${state.lastResult}|agenda-icons:g${iconSync.generated ?? 0}`;
      }
    } catch (error) {
      console.warn("[scheduler] agenda ai icons:", error);
    }

    try {
      const { syncAgendaNotesWritebackIfDue } = await import(
        "@/lib/dashboard/agenda-notes-writeback"
      );
      const notesSync = await syncAgendaNotesWritebackIfDue().catch((error) => {
        console.warn("[scheduler] agenda notes writeback:", error);
        return null;
      });
      if (notesSync?.attempted) {
        const n =
          (notesSync.updatedGoogle ?? 0) + (notesSync.updatedMicrosoft ?? 0);
        state.lastResult = `${state.lastResult}|agenda-notes:u${n}`;
      }
    } catch (error) {
      console.warn("[scheduler] agenda notes writeback:", error);
    }

    try {
      const { findRolfAppUserId } = await import(
        "@/lib/calendar/ics-calendars"
      );
      const { maybeDispatchBriefingPushes } = await import(
        "@/lib/dashboard/briefing-push"
      );
      const pushed = await maybeDispatchBriefingPushes(findRolfAppUserId());
      if (pushed.morning || pushed.evening) {
        state.lastResult = `${state.lastResult}|briefing:${pushed.morning ? "am" : ""}${pushed.evening ? "pm" : ""}`;
      }
    } catch (error) {
      console.warn("[scheduler] briefing push:", error);
    }

    // Drive mirror: continue migration while pending (throttled by job lease)
    try {
      const { getDriveMirrorStatus, isDriveMirrorEnabled } = await import(
        "@/lib/buddy/drive-mirror"
      );
      const st = getDriveMirrorStatus();
      if (
        isDriveMirrorEnabled() &&
        st.hasDriveScope &&
        st.pending > 0
      ) {
        const { runDriveMirrorJob } = await import(
          "@/lib/jobs/background-runners"
        );
        // Only kick if no other job holds the lease — runDriveMirrorJob skips otherwise
        void runDriveMirrorJob("schedule").catch((error) => {
          console.warn("[scheduler] drive mirror:", error);
        });
      }
    } catch (error) {
      console.warn("[scheduler] drive mirror check:", error);
    }

    // O365 PDF → Paperless backfill (while enabled / cursor remains)
    try {
      const { getO365PdfBackfillStatus } = await import(
        "@/lib/microsoft/mail-paperless-backfill"
      );
      const st = getO365PdfBackfillStatus();
      if (st.enabled || st.hasCursor) {
        const { runO365PdfBackfillJob } = await import(
          "@/lib/jobs/background-runners"
        );
        void runO365PdfBackfillJob("schedule").catch((error) => {
          console.warn("[scheduler] o365 pdf backfill:", error);
        });
      }
    } catch (error) {
      console.warn("[scheduler] o365 pdf backfill check:", error);
    }
  } catch (error) {
    state.lastResult =
      error instanceof Error ? error.message : String(error);
  } finally {
    state.running = false;
    if (getInitialIngestionComplete()) {
      scheduleNext(settings.intervalMinutes);
    } else {
      scheduleNextMs(INITIAL_RETRY_INTERVAL_MS);
    }
  }
}

function scheduleNextMs(ms: number): void {
  const state = getState();
  state.nextTickAt = new Date(Date.now() + Math.max(1_000, ms)).toISOString();
}

function scheduleNext(intervalMinutes: number): void {
  const state = getState();
  if (state.tickTimer) {
    clearTimeout(state.tickTimer);
    state.tickTimer = null;
  }
  scheduleNextMs(Math.max(1, intervalMinutes) * 60 * 1000);
}

/**
 * Start the in-process scheduler once per Node process.
 * Interval is re-read from SQLite on every tick so UI changes apply live.
 */
export function startScheduler(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  try {
    // In this deployment there is exactly one Node process. Any persisted
    // running lease at process startup belongs to an interrupted predecessor.
    recoverExpiredJobLeases(new Date(Date.now() + JOB_LEASE_MS + 1));
    recoverExpiredAnalysisClaims(
      new Date(Date.now() + ANALYSIS_CLAIM_LEASE_MS + 1)
    );
  } catch (error) {
    console.error("[familybrain] Failed to recover job leases:", error);
  }

  // Poll settings frequently; actual job runs only when due.
  const pollMs = 15_000;
  let lastDueCheck = 0;

  const check = () => {
    try {
      const settings = getSchedulerSettings();
      if (!settings.enabled) {
        state.nextTickAt = null;
        return;
      }

      const now = Date.now();

      if (!state.lastTickAt) {
        // Initial ingestion starts shortly after startup and runs independently
        // until every document is synchronized and analyzed.
        if (!state.nextTickAt) {
          state.nextTickAt = new Date(now + 20_000).toISOString();
        }
      } else if (!state.nextTickAt) {
        scheduleNext(settings.intervalMinutes);
      }

      const dueAt = state.nextTickAt
        ? new Date(state.nextTickAt).getTime()
        : Number.POSITIVE_INFINITY;

      if (now >= dueAt && now - lastDueCheck > 1000) {
        lastDueCheck = now;
        void tick();
      }
    } catch (error) {
      console.error("[familybrain] Scheduler tick check failed:", error);
    }
  };

  state.timer = setInterval(check, pollMs);
  // Unref so the timer doesn't keep a short-lived CLI process alive.
  if (typeof state.timer.unref === "function") {
    state.timer.unref();
  }
  check();
}

export function getSchedulerRuntimeStatus() {
  const state = getState();
  const settings = getSchedulerSettings();
  return {
    started: state.started,
    ticking: state.running,
    lastTickAt: state.lastTickAt,
    nextTickAt: settings.enabled ? state.nextTickAt : null,
    lastResult: state.lastResult,
    initialComplete: getInitialIngestionComplete(),
    ...settings,
  };
}

/** Force the next scheduled due time (e.g. after interval change). */
export function rescheduleFromNow(): void {
  const settings = getSchedulerSettings();
  if (getInitialIngestionComplete()) {
    scheduleNext(settings.intervalMinutes);
  } else {
    scheduleNextMs(20_000);
  }
}
