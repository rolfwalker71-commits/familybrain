"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellOff, X } from "lucide-react";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import type { AppNotifyPayload, NotifyReason } from "@/lib/realtime/hub";
import {
  isReasonEnabled,
  mergeNotificationPrefs,
  passesScopeFilter,
  type UserNotificationPrefs,
} from "@/lib/realtime/prefs-client";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: string;
  notification: AppNotifyPayload;
  at: string;
};

function playBling() {
  if (typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);
    void ctx.resume().catch(() => undefined);
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 400);
  } catch {
    /* autoplay / unsupported */
  }
}

function sourceLabel(n: AppNotifyPayload): string {
  if (n.source === "paperless") return "Paperless";
  if (n.source === "travel") return "TravelBuddy";
  if (n.source === "finance") return "FinanzBuddy";
  return "Buddy";
}

/**
 * Global toasts for app events (SSE).
 * Dismiss: X, click outside, Escape. Prefs from /api/me/notification-prefs.
 */
export function RealtimeToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [prefs, setPrefs] = useState<UserNotificationPrefs>(() =>
    mergeNotificationPrefs(null)
  );
  const timersRef = useRef<Map<string, number>>(new Map());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const t of timersRef.current.values()) window.clearTimeout(t);
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const pushToast = useCallback(
    (notification: AppNotifyPayload, at: string) => {
      const p = prefsRef.current;
      if (!isReasonEnabled(p, notification.reason as NotifyReason)) return;
      if (
        !passesScopeFilter(p, {
          tripId: notification.tripId,
          ledgerId: notification.ledgerId,
        })
      ) {
        return;
      }

      const id = `${notification.reason}-${at}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [{ id, notification, at }, ...prev].slice(0, 4));
      if (p.soundEnabled) playBling();
      const ms = Math.max(3, p.durationSec) * 1000;
      const timer = window.setTimeout(() => dismiss(id), ms);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/notification-prefs");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data.prefs) return;
        setPrefs(mergeNotificationPrefs(data.prefs));
      } catch {
        /* defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/realtime/stream");

    const onInbox = () => {
      window.dispatchEvent(new CustomEvent("buddy:inbox"));
    };

    const onNotify = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          at?: string;
          notification?: AppNotifyPayload;
        };
        const n = data.notification;
        if (n) pushToast(n, data.at || new Date().toISOString());
        if (n?.domain === "documents") onInbox();
      } catch {
        /* ignore */
      }
    };

    es.addEventListener("inbox", onInbox);
    es.addEventListener("notify", onNotify);

    return () => {
      es.removeEventListener("inbox", onInbox);
      es.removeEventListener("notify", onNotify);
      es.close();
    };
  }, [pushToast]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const top = toasts[0];
        if (top) dismiss(top.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toasts, dismiss]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) window.clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  async function disableNotifications() {
    setPrefs((prev) => ({ ...prev, enabled: false }));
    dismissAll();
    try {
      await fetch("/api/me/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
    } catch {
      /* local mute */
    }
  }

  if (!prefs.enabled || toasts.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Benachrichtigungen schliessen"
        className="fixed inset-0 z-[79] cursor-default bg-transparent"
        onClick={() => dismissAll()}
      />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-end gap-2 p-3 sm:bottom-4 sm:right-4 sm:left-auto sm:w-[min(100%,24rem)] sm:p-0"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const n = toast.notification;
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-border/70",
                "bg-background/95 shadow-[0_12px_40px_rgba(20,32,28,0.18)] backdrop-blur-md",
                "animate-in slide-in-from-bottom-4 fade-in duration-300"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-3 p-3 pr-11">
                <DocumentAiIcon
                  aiIconUrl={n.aiIconUrl}
                  category={n.category}
                  size="md"
                  zoomable={false}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-docs)]">
                    {n.headline}
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">
                      · {sourceLabel(n)}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold leading-snug">
                    {n.title || "Aktualisierung"}
                  </p>
                  {n.meta ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {n.meta}
                    </p>
                  ) : null}
                  {n.detail ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {n.detail}
                    </p>
                  ) : null}
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="mt-2 inline-block text-xs font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
                      onClick={() => dismiss(toast.id)}
                    >
                      Öffnen
                    </Link>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="absolute right-1.5 top-1.5 z-10 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Schliessen"
                onClick={() => dismiss(toast.id)}
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur hover:bg-muted hover:text-foreground"
            onClick={() => dismissAll()}
          >
            Alle schliessen
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur hover:bg-muted hover:text-foreground"
            onClick={() => void disableNotifications()}
            title="Live-Benachrichtigungen ausschalten"
          >
            <BellOff className="size-3" />
            Benachrichtigungen aus
          </button>
        </div>
      </div>
    </>
  );
}
