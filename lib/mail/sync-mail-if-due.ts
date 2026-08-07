import { getSetting, setSetting } from "@/lib/db/migrations";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { isGoogleMailConnected } from "@/lib/google/oauth";
import { listGmailMessages, type MailListItem } from "@/lib/mail/gmail";
import {
  syncMailAnalysesForItems,
  type MailSyncResult,
} from "@/lib/mail/sync-mail-analysis";

export const MAIL_AI_LAST_SYNC_KEY = "mail_ai_last_sync_at";
export const MAIL_AI_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export type MailBackgroundSyncSummary = {
  attempted: boolean;
  reason?: string;
  userId?: number;
  sync?: MailSyncResult;
};

/** Prefer Rolf (calendar owner), else first connected Google user id. */
export function resolveMailSyncUserId(): number | null {
  const rolf = findRolfAppUserId();
  if (rolf != null && isGoogleMailConnected(rolf)) return rolf;
  return null;
}

function mergeById(a: MailListItem[], b: MailListItem[]): MailListItem[] {
  const map = new Map<string, MailListItem>();
  for (const item of [...a, ...b]) {
    if (item.id) map.set(item.id, item);
  }
  return [...map.values()];
}

/**
 * Throttled background mail AI sync (scheduler / manual kick).
 * Lists today + unread (cap 25), analyzes with maxAi 8.
 */
export async function syncMailAnalysesIfDue(options?: {
  force?: boolean;
  now?: Date;
}): Promise<MailBackgroundSyncSummary> {
  const now = options?.now ?? new Date();
  const userId = resolveMailSyncUserId();
  if (userId == null) {
    return { attempted: false, reason: "no-google-user" };
  }

  if (!options?.force) {
    const lastRaw = getSetting(MAIL_AI_LAST_SYNC_KEY);
    if (lastRaw) {
      const last = new Date(lastRaw).getTime();
      if (
        Number.isFinite(last) &&
        now.getTime() - last < MAIL_AI_SYNC_INTERVAL_MS
      ) {
        return { attempted: false, reason: "throttled", userId };
      }
    }
  }

  setSetting(MAIL_AI_LAST_SYNC_KEY, now.toISOString());

  try {
    const [today, unread] = await Promise.all([
      listGmailMessages(userId, {
        filter: "today",
        limit: 25,
        forceRefresh: true,
      }),
      listGmailMessages(userId, {
        filter: "unread",
        limit: 25,
        forceRefresh: true,
      }),
    ]);
    const items = mergeById(today, unread).slice(0, 25);
    const sync = await syncMailAnalysesForItems(userId, items, { maxAi: 8 });
    return { attempted: true, userId, sync };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[mail] background sync failed:", msg);
    return { attempted: true, userId, reason: msg };
  }
}
