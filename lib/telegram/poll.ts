import {
  getTelegramInboundMode,
  hasTelegramConfigured,
  telegramGetUpdates,
} from "@/lib/telegram/notify";
import {
  getTelegramUpdateOffset,
  processTelegramUpdate,
  setTelegramUpdateOffset,
  type TelegramUpdate,
} from "@/lib/telegram/inbound";

const globalKey = "__buddy_telegram_poll__";

type PollState = {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
  lastError: string | null;
  lastOkAt: string | null;
};

function getState(): PollState {
  const g = globalThis as unknown as Record<string, PollState | undefined>;
  if (!g[globalKey]) {
    g[globalKey] = {
      started: false,
      timer: null,
      running: false,
      lastError: null,
      lastOkAt: null,
    };
  }
  return g[globalKey]!;
}

async function pollOnce(): Promise<void> {
  if (!hasTelegramConfigured()) return;
  if (getTelegramInboundMode() !== "poll") return;

  const offset = getTelegramUpdateOffset();
  const result = await telegramGetUpdates({
    offset: offset > 0 ? offset : undefined,
    timeoutSec: 0,
  });
  if (!result.ok) {
    getState().lastError = result.error;
    return;
  }
  getState().lastError = null;
  getState().lastOkAt = new Date().toISOString();

  let maxId = offset;
  for (const raw of result.updates) {
    const update = raw as TelegramUpdate;
    if (typeof update.update_id === "number") {
      maxId = Math.max(maxId, update.update_id + 1);
    }
    try {
      await processTelegramUpdate(update);
    } catch (err) {
      console.warn(
        "[telegram] process update failed:",
        err instanceof Error ? err.message : err
      );
    }
  }
  if (maxId > offset) setTelegramUpdateOffset(maxId);
}

/**
 * Lightweight poll loop (only when inbound mode = poll).
 * Webhook mode must not call getUpdates.
 */
export function startTelegramPollLoop(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  const tick = () => {
    if (state.running) return;
    if (!hasTelegramConfigured()) return;
    if (getTelegramInboundMode() !== "poll") return;
    state.running = true;
    void pollOnce()
      .catch((err) => {
        state.lastError = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        state.running = false;
      });
  };

  state.timer = setInterval(tick, 2500);
  if (typeof state.timer.unref === "function") state.timer.unref();
  // First poll shortly after boot
  setTimeout(tick, 4000);
}

export function getTelegramPollRuntimeStatus() {
  const state = getState();
  return {
    started: state.started,
    running: state.running,
    mode: getTelegramInboundMode(),
    lastError: state.lastError,
    lastOkAt: state.lastOkAt,
    offset: getTelegramUpdateOffset(),
  };
}
