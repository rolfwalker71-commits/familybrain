"use client";

import { useEffect, useRef, useState } from "react";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
import { cn } from "@/lib/utils";

/**
 * Agenda AI thumbnail: hover (desktop) / tippen opens fullscreen zoom.
 * Lazily requests generation when only a cache key is known.
 */
export function AgendaAiIconThumb({
  itemId,
  title,
  location,
  description,
  calendarType,
  kind,
  aiIconKey,
  aiIconUrl,
  className,
}: {
  itemId: string;
  title: string;
  location?: string | null;
  description?: string | null;
  calendarType?: string | null;
  kind?: string | null;
  aiIconKey?: string | null;
  aiIconUrl?: string | null;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(aiIconUrl ?? null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    setUrl(aiIconUrl ?? null);
  }, [aiIconUrl]);

  useEffect(() => {
    if (url || !aiIconKey || asked.current) return;
    asked.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/calendar/ai-icons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              {
                id: itemId,
                title,
                location,
                description,
                calendarType,
                kind,
              },
            ],
          }),
        });
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const next =
          data.byId?.[itemId]?.url ||
          (aiIconKey ? data.byKey?.[aiIconKey] : null) ||
          null;
        if (next) setUrl(next);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    url,
    aiIconKey,
    itemId,
    title,
    location,
    description,
    calendarType,
    kind,
  ]);

  function clearHoverTimer() {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function scheduleZoomOpen() {
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      setZoomOpen(true);
      hoverTimer.current = null;
    }, 180);
  }

  if (!url && !aiIconKey) return null;

  if (!url) {
    return (
      <span
        className={cn(
          "size-12 shrink-0 animate-pulse rounded-lg bg-muted/70 sm:size-14",
          className
        )}
        aria-hidden
      />
    );
  }

  return (
    <>
      <button
        type="button"
        title="Vergrössern"
        className={cn(
          "relative shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/50 shadow-sm",
          className
        )}
        onClick={(e) => {
          e.stopPropagation();
          clearHoverTimer();
          setZoomOpen(true);
        }}
        onMouseEnter={scheduleZoomOpen}
        onMouseLeave={clearHoverTimer}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="size-12 object-cover sm:size-14"
        />
      </button>
      {zoomOpen ? (
        <AiImageZoom src={url} onClose={() => setZoomOpen(false)} />
      ) : null}
    </>
  );
}
