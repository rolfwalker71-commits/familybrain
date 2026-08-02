import webpush from "web-push";
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { NOTIFY_REASON_DOMAIN } from "@/lib/realtime/prefs";
import {
  getNotificationPrefsForOwnerKey,
  isReasonEnabled,
  passesScopeFilter,
} from "@/lib/realtime/prefs";
import { parseOwnerKey } from "@/lib/auth/owner-key";
import {
  listAppUsers,
  userHasLedgerAccess,
  userHasTripAccess,
} from "@/lib/users/queries";
import {
  deletePushSubscriptionRow,
  listAllPushSubscriptions,
  type PushSubscriptionRow,
} from "@/lib/push/subscriptions";
import { ensureWebPushConfigured } from "@/lib/push/vapid";
import { absoluteAppUrl } from "@/lib/app-url";
import { absolutePushMediaUrl } from "@/lib/push/signed-media";

function ownerMayReceive(
  ownerKey: string,
  notification: AppNotifyPayload
): boolean {
  const parsed = parseOwnerKey(ownerKey);
  if (!parsed) return false;
  if (parsed.kind === "admin") return true;

  const domain =
    NOTIFY_REASON_DOMAIN[notification.reason] || notification.domain;
  if (domain === "documents") {
    const user = listAppUsers().find((u) => u.id === parsed.userId);
    return Boolean(user?.is_admin);
  }
  if (domain === "travel" && notification.tripId != null) {
    return userHasTripAccess(parsed.userId, notification.tripId);
  }
  if (domain === "finance" && notification.ledgerId != null) {
    return userHasLedgerAccess(parsed.userId, notification.ledgerId);
  }
  return domain === "travel" || domain === "finance";
}

async function sendOne(
  row: PushSubscriptionRow,
  payload: string
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      payload,
      { TTL: 60 * 60 * 12 }
    );
  } catch (err) {
    const status =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : 0;
    if (status === 404 || status === 410) {
      deletePushSubscriptionRow(row.id);
    }
  }
}

export async function dispatchWebPush(
  notification: AppNotifyPayload
): Promise<{ sent: number }> {
  if (!ensureWebPushConfigured()) return { sent: 0 };

  const rows = listAllPushSubscriptions();
  if (rows.length === 0) return { sent: 0 };

  const fallbackIcon = absoluteAppUrl("/icon-512.png");
  const mediaUrl = absolutePushMediaUrl(notification.aiIconUrl);
  const payload = JSON.stringify({
    title: notification.headline || "Buddy",
    body:
      [notification.title, notification.detail].filter(Boolean).join(" — ") ||
      "Neue Benachrichtigung",
    url: notification.href || "/dashboard",
    reason: notification.reason,
    domain: notification.domain,
    /** Small/medium toast icon (Android + desktop). */
    icon: mediaUrl || fallbackIcon,
    badge: absoluteAppUrl("/icon-192.png"),
    /** Large image when the notification is expanded (esp. Android). */
    image: mediaUrl || fallbackIcon,
  });

  const byOwner = new Map<string, PushSubscriptionRow[]>();
  for (const row of rows) {
    const list = byOwner.get(row.owner_key) || [];
    list.push(row);
    byOwner.set(row.owner_key, list);
  }

  let sent = 0;
  const tasks: Promise<void>[] = [];

  for (const [ownerKey, subs] of byOwner) {
    if (!ownerMayReceive(ownerKey, notification)) continue;
    const prefs = getNotificationPrefsForOwnerKey(ownerKey);
    if (!isReasonEnabled(prefs, notification.reason)) continue;
    if (
      !passesScopeFilter(prefs, {
        tripId: notification.tripId,
        ledgerId: notification.ledgerId,
      })
    ) {
      continue;
    }
    for (const sub of subs) {
      tasks.push(
        sendOne(sub, payload).then(() => {
          sent += 1;
        })
      );
    }
  }

  await Promise.all(tasks);
  return { sent };
}
