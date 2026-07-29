import { getSetting, setSetting } from "@/lib/db/migrations";
import type { AuthContext } from "@/lib/auth/current-user";
import type { NotifyReason } from "@/lib/realtime/hub";
import { getDb } from "@/lib/db/client";

const GLOBAL_ENABLED_KEY = "live_notifications_enabled";
const GLOBAL_DURATION_KEY = "live_notifications_duration_sec";
const GLOBAL_SOUND_KEY = "live_notifications_sound_enabled";
const GLOBAL_EVENTS_KEY = "live_notifications_events";

export const LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC = 9;
export const LIVE_NOTIFICATIONS_MIN_DURATION_SEC = 3;
export const LIVE_NOTIFICATIONS_MAX_DURATION_SEC = 60;

export const ALL_NOTIFY_REASONS: NotifyReason[] = [
  "paperless_new",
  "paperless_updated",
  "paperless_sync",
  "analysis_completed",
  "ai_icon",
  "buddy_status",
  "mark_paid",
  "trip_comment",
  "trip_event_updated",
  "trip_event_ai_image",
  "finance_expense_created",
  "finance_expense_updated",
  "finance_expense_ai_image",
  "finance_settlement",
];

export const NOTIFY_REASON_LABELS: Record<NotifyReason, string> = {
  paperless_new: "Neues Dokument (Paperless)",
  paperless_updated: "Dokument aktualisiert (Paperless)",
  paperless_sync: "Paperless-Webhook (unverändert)",
  analysis_completed: "Dokument-Analyse fertig",
  ai_icon: "Dokument-AI-Icon",
  buddy_status: "Buddy-Status",
  mark_paid: "Als bezahlt markiert",
  trip_comment: "Neuer Reise-Kommentar",
  trip_event_updated: "Reise-Ereignis geändert",
  trip_event_ai_image: "Reise-Ereignis KI-Bild",
  finance_expense_created: "Neue Ausgabe",
  finance_expense_updated: "Ausgabe geändert",
  finance_expense_ai_image: "Ausgaben-KI-Bild",
  finance_settlement: "Rückzahlung",
};

export const NOTIFY_REASON_DOMAIN: Record<
  NotifyReason,
  "documents" | "travel" | "finance"
> = {
  paperless_new: "documents",
  paperless_updated: "documents",
  paperless_sync: "documents",
  analysis_completed: "documents",
  ai_icon: "documents",
  buddy_status: "documents",
  mark_paid: "documents",
  trip_comment: "travel",
  trip_event_updated: "travel",
  trip_event_ai_image: "travel",
  finance_expense_created: "finance",
  finance_expense_updated: "finance",
  finance_expense_ai_image: "finance",
  finance_settlement: "finance",
};

export type UserNotificationPrefs = {
  enabled: boolean;
  soundEnabled: boolean;
  durationSec: number;
  /** Missing keys inherit default true */
  events: Partial<Record<NotifyReason, boolean>>;
  /** null / empty = all trips */
  tripIds: number[] | null;
  /** null / empty = all ledgers */
  ledgerIds: number[] | null;
};

function clampDuration(n: number): number {
  return Math.min(
    LIVE_NOTIFICATIONS_MAX_DURATION_SEC,
    Math.max(LIVE_NOTIFICATIONS_MIN_DURATION_SEC, Math.round(n))
  );
}

export function defaultNotificationPrefs(): UserNotificationPrefs {
  const events: Partial<Record<NotifyReason, boolean>> = {};
  for (const r of ALL_NOTIFY_REASONS) {
    // paperless_sync is noisy — off by default
    events[r] = r !== "paperless_sync";
  }
  return {
    enabled: true,
    soundEnabled: true,
    durationSec: LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
    events,
    tripIds: null,
    ledgerIds: null,
  };
}

function parseEventsJson(
  raw: string | null | undefined
): Partial<Record<NotifyReason, boolean>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<NotifyReason, boolean>> = {};
    for (const r of ALL_NOTIFY_REASONS) {
      if (typeof parsed[r] === "boolean") out[r] = parsed[r];
    }
    return out;
  } catch {
    return {};
  }
}

function parseIdList(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : null;
}

export function mergeNotificationPrefs(
  partial: Partial<UserNotificationPrefs> | null | undefined
): UserNotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!partial) return base;
  return {
    enabled: partial.enabled ?? base.enabled,
    soundEnabled: partial.soundEnabled ?? base.soundEnabled,
    durationSec: clampDuration(
      partial.durationSec ?? base.durationSec
    ),
    events: { ...base.events, ...partial.events },
    tripIds:
      partial.tripIds === undefined ? base.tripIds : partial.tripIds,
    ledgerIds:
      partial.ledgerIds === undefined ? base.ledgerIds : partial.ledgerIds,
  };
}

/** Global defaults (admin / fallback). */
export function getGlobalNotificationPrefs(): UserNotificationPrefs {
  const enabledRaw = getSetting(GLOBAL_ENABLED_KEY);
  const enabled =
    enabledRaw == null || enabledRaw === ""
      ? true
      : enabledRaw === "1" || enabledRaw.toLowerCase() === "true";
  const soundRaw = getSetting(GLOBAL_SOUND_KEY);
  const soundEnabled =
    soundRaw == null || soundRaw === ""
      ? true
      : soundRaw === "1" || soundRaw.toLowerCase() === "true";
  const durRaw = getSetting(GLOBAL_DURATION_KEY);
  const dur =
    durRaw != null && durRaw !== "" ? Number.parseInt(durRaw, 10) : NaN;
  return mergeNotificationPrefs({
    enabled,
    soundEnabled,
    durationSec: Number.isFinite(dur)
      ? dur
      : LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
    events: parseEventsJson(getSetting(GLOBAL_EVENTS_KEY)),
    tripIds: null,
    ledgerIds: null,
  });
}

export function saveGlobalNotificationPrefs(
  prefs: UserNotificationPrefs
): void {
  setSetting(GLOBAL_ENABLED_KEY, prefs.enabled ? "1" : "0");
  setSetting(GLOBAL_SOUND_KEY, prefs.soundEnabled ? "1" : "0");
  setSetting(GLOBAL_DURATION_KEY, String(clampDuration(prefs.durationSec)));
  setSetting(GLOBAL_EVENTS_KEY, JSON.stringify(prefs.events));
}

export function getUserNotificationPrefsJson(
  userId: number
): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT notification_prefs FROM users WHERE id = ?`)
    .get(userId) as { notification_prefs: string | null } | undefined;
  return row?.notification_prefs ?? null;
}

export function setUserNotificationPrefsJson(
  userId: number,
  json: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE users SET notification_prefs = ?, updated_at = ? WHERE id = ?`
  ).run(json, new Date().toISOString(), userId);
}

export function getNotificationPrefsForAuth(
  auth: AuthContext
): UserNotificationPrefs {
  const global = getGlobalNotificationPrefs();
  if (!auth.userId) return global;
  const raw = getUserNotificationPrefsJson(auth.userId);
  if (!raw) return global;
  try {
    const parsed = JSON.parse(raw) as Partial<UserNotificationPrefs>;
    return mergeNotificationPrefs({
      ...parsed,
      tripIds: parseIdList(parsed.tripIds),
      ledgerIds: parseIdList(parsed.ledgerIds),
      events: parsed.events ?? {},
    });
  } catch {
    return global;
  }
}

export function saveNotificationPrefsForAuth(
  auth: AuthContext,
  prefs: UserNotificationPrefs
): UserNotificationPrefs {
  const next = mergeNotificationPrefs(prefs);
  if (!auth.userId) {
    saveGlobalNotificationPrefs(next);
    return getGlobalNotificationPrefs();
  }
  setUserNotificationPrefsJson(auth.userId, JSON.stringify(next));
  return next;
}

export function isReasonEnabled(
  prefs: UserNotificationPrefs,
  reason: NotifyReason
): boolean {
  if (!prefs.enabled) return false;
  const v = prefs.events[reason];
  if (v === undefined) return reason !== "paperless_sync";
  return v;
}

export function passesScopeFilter(
  prefs: UserNotificationPrefs,
  input: { tripId?: number | null; ledgerId?: number | null }
): boolean {
  if (input.tripId != null && prefs.tripIds && prefs.tripIds.length > 0) {
    if (!prefs.tripIds.includes(input.tripId)) return false;
  }
  if (
    input.ledgerId != null &&
    prefs.ledgerIds &&
    prefs.ledgerIds.length > 0
  ) {
    if (!prefs.ledgerIds.includes(input.ledgerId)) return false;
  }
  return true;
}

/* ---- backwards-compatible global getters used by settings API ---- */

export function isLiveNotificationsEnabled(): boolean {
  return getGlobalNotificationPrefs().enabled;
}

export function setLiveNotificationsEnabled(enabled: boolean): void {
  const p = getGlobalNotificationPrefs();
  saveGlobalNotificationPrefs({ ...p, enabled });
}

export function getLiveNotificationsDurationSec(): number {
  return getGlobalNotificationPrefs().durationSec;
}

export function setLiveNotificationsDurationSec(seconds: number): void {
  const p = getGlobalNotificationPrefs();
  saveGlobalNotificationPrefs({ ...p, durationSec: clampDuration(seconds) });
}

export function isLiveNotificationsSoundEnabled(): boolean {
  return getGlobalNotificationPrefs().soundEnabled;
}

export function setLiveNotificationsSoundEnabled(enabled: boolean): void {
  const p = getGlobalNotificationPrefs();
  saveGlobalNotificationPrefs({ ...p, soundEnabled: enabled });
}
