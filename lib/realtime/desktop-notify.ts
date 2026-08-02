/** Browser Notification API helpers (Windows / OS toast when tab is in background). */

import type { AppNotifyPayload } from "@/lib/realtime/hub";

export function desktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getDesktopNotificationPermission(): NotificationPermission | "unsupported" {
  if (!desktopNotificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!desktopNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function absoluteUrl(href: string | null | undefined): string | undefined {
  if (!href?.trim()) return undefined;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${href}`;
  }
  return undefined;
}

/**
 * Show an OS desktop notification. Call only after prefs/filters passed.
 * Typically when the Buddy tab is in the background.
 */
export function showDesktopNotification(n: AppNotifyPayload): void {
  if (!desktopNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;

  const title = n.headline?.trim() || "Buddy";
  const body = [n.title, n.detail || n.meta]
    .filter((x) => Boolean(x && String(x).trim()))
    .join(" — ");
  const icon =
    absoluteUrl(n.aiIconUrl) || absoluteUrl("/icon-512.png") || undefined;
  const image =
    absoluteUrl(n.aiIconUrl) || absoluteUrl("/icon-512.png") || undefined;
  const tag = [
    n.reason,
    n.localId ?? n.paperlessId ?? n.tripId ?? n.ledgerId ?? "",
  ].join("-");

  try {
    const note = new Notification(title, {
      body: body || undefined,
      icon,
      // Chromium: larger preview when the toast is expanded (where supported).
      ...(image ? { image } : {}),
      tag: tag || undefined,
      data: { href: n.href || null },
    } as NotificationOptions);
    note.onclick = () => {
      try {
        window.focus();
        const href = n.href?.trim();
        if (href) {
          if (href.startsWith("/")) {
            window.location.assign(href);
          } else if (/^https?:\/\//i.test(href)) {
            window.location.assign(href);
          }
        }
      } finally {
        note.close();
      }
    };
  } catch {
    /* Notification constructor can throw if blocked */
  }
}
