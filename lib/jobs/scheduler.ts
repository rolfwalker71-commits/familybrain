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
