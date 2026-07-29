"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellOff, X } from "lucide-react";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { toSwissDate } from "@/lib/utils/dates";
import type { DocumentNotifyPayload } from "@/lib/realtime/hub";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: string;
  document: DocumentNotifyPayload;
  at: string;
};

function metaLine(doc: DocumentNotifyPayload): string {
  const parts = [
    doc.correspondentName,
    doc.documentTypeName,
    doc.createdDate ? toSwissDate(doc.createdDate) : null,
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(" · ")
    : `Paperless-ID ${doc.paperlessId}`;
}

function sourceLabel(doc: DocumentNotifyPayload): string {
  return doc.source === "paperless" ? "Paperless" : "Buddy";
}

/**
 * Global toasts for document changes (SSE).
 * Dismiss: X, click outside, Escape. Duration from Settings.
 */
export function RealtimeToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [durationSec, setDurationSec] = useState(9);
  const timersRef = useRef<Map<string, number>>(new Map());

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
    (document: DocumentNotifyPayload, at: string) => {
      const id = `${document.localId}-${document.reason}-${at}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [{ id, document, at }, ...prev].slice(0, 4));
      const ms = Math.max(3, durationSec) * 1000;
      const timer = window.setTimeout(() => dismiss(id), ms);
      timersRef.current.set(id, timer);
    },
    [dismiss, durationSec]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setEnabled(data.liveNotificationsEnabled !== false);
        const d = Number(data.liveNotificationsDurationSec);
        if (Number.isFinite(d) && d >= 3) setDurationSec(d);
      } catch {
        /* keep defaults */
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

    const onDocument = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          at?: string;
          document?: DocumentNotifyPayload;
        };
        if (data.document && enabled) {
          pushToast(data.document, data.at || new Date().toISOString());
        }
        onInbox();
      } catch {
        /* ignore */
      }
    };

    es.addEventListener("inbox", onInbox);
    es.addEventListener("document", onDocument);

    return () => {
      es.removeEventListener("inbox", onInbox);
      es.removeEventListener("document", onDocument);
      es.close();
    };
  }, [enabled, pushToast]);

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
    setEnabled(false);
    dismissAll();
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveNotificationsEnabled: false }),
      });
    } catch {
      /* local mute still active */
    }
  }

  if (!enabled || toasts.length === 0) return null;

  return (
    <>
      {/* Click outside → alle Toasts weg */}
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
          const doc = toast.document;
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
                  aiIconUrl={doc.aiIconUrl}
                  category={doc.category}
                  size="md"
                  zoomable={false}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-docs)]">
                    {doc.headline}
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">
                      · {sourceLabel(doc)}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold leading-snug">
                    {doc.title || `Dokument #${doc.localId}`}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {metaLine(doc)}
                  </p>
                  {doc.detail ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {doc.detail}
                    </p>
                  ) : null}
                  <Link
                    href={`/documents/${doc.localId}`}
                    className="mt-2 inline-block text-xs font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
                    onClick={() => dismiss(toast.id)}
                  >
                    Dokument öffnen
                  </Link>
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
            title="Live-Benachrichtigungen ausschalten (auch unter Einstellungen)"
          >
            <BellOff className="size-3" />
            Benachrichtigungen aus
          </button>
        </div>
      </div>
    </>
  );
}
