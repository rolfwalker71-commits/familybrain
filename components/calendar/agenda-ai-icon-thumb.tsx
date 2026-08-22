"use client";

import { useEffect, useState } from "react";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Agenda AI thumbnail. Opens zoom only on explicit click (no hover).
 * Lazily ensures/generates when a cache key is known or title is present.
 */
export function AgendaAiIconThumb({
  itemId,
  title,
  location,
  description,
  calendarType,
  calendarName,
  kind,
  meetUrl,
  time,
  endTime,
  driveMinutes,
  distanceKm,
  coords,
  aiIconKey,
  aiIconUrl,
  className,
  imgClassName,
  showAiBadge = false,
}: {
  itemId: string;
  title: string;
  location?: string | null;
  description?: string | null;
  calendarType?: string | null;
  calendarName?: string | null;
  kind?: string | null;
  meetUrl?: string | null;
  time?: string | null;
  endTime?: string | null;
  driveMinutes?: number | null;
  distanceKm?: number | null;
  coords?: { lat: number; lon: number } | null;
  aiIconKey?: string | null;
  aiIconUrl?: string | null;
  className?: string;
  /** Override default size-12 / sm:size-14 thumbnail */
  imgClassName?: string;
  /** Grünes «AI»-Badge unten rechts (Mockup). */
  showAiBadge?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(aiIconUrl ?? null);
  const [loading, setLoading] = useState(
    () => !aiIconUrl && Boolean(aiIconKey)
  );
  const [failed, setFailed] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    setUrl(aiIconUrl ?? null);
    if (aiIconUrl) {
      setFailed(false);
      setLoading(false);
    }
  }, [aiIconUrl]);

  useEffect(() => {
    if (url) return;
    // Only generate calendar-cache icons when a key is known.
    // Document / trip / expense thumbs come from a different origin URL.
    if (!aiIconKey) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    async function fetchIcon(attempt: number): Promise<void> {
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
                calendarName,
                kind,
                meetUrl,
                time,
                endTime,
                driveMinutes,
                distanceKm,
                coords,
              },
            ],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 600));
            if (!cancelled) await fetchIcon(attempt + 1);
            return;
          }
          setFailed(true);
          return;
        }
        const fromId = data.byId?.[itemId]?.url as string | undefined;
        const fromPropKey = aiIconKey
          ? (data.byKey?.[aiIconKey] as string | undefined)
          : undefined;
        const fromAnyKey = Object.values(
          (data.byKey || {}) as Record<string, string>
        )[0];
        const next = fromId || fromPropKey || fromAnyKey || null;
        if (next) {
          setUrl(next);
          setFailed(false);
        } else if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 600));
          if (!cancelled) await fetchIcon(attempt + 1);
        } else {
          setFailed(true);
        }
      } catch {
        if (cancelled) return;
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 600));
          if (!cancelled) await fetchIcon(attempt + 1);
          return;
        }
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchIcon(0);

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
    calendarName,
    kind,
    meetUrl,
    time,
    endTime,
    driveMinutes,
    distanceKm,
    coords?.lat,
    coords?.lon,
  ]);

  const sizeClass = imgClassName || "size-12 sm:size-14";
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";

  if (!url && loading) {
    return (
      <span
        className={cn(
          "shrink-0 animate-pulse rounded-lg bg-muted/70",
          sizeClass,
          className
        )}
        aria-hidden
      />
    );
  }

  if (!url) {
    // Kein Endlos-Puls: Buchstaben-Fallback wenn Generierung ausbleibt
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/50 text-[0.8125rem] font-bold text-muted-foreground",
          sizeClass,
          className,
          failed && "opacity-80"
        )}
        aria-hidden
        title={title}
      >
        {initial}
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        title="Vergrössern"
        className={cn(
          "relative h-auto w-auto shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/50 p-0 shadow-sm hover:bg-transparent",
          className
        )}
        onClick={(e) => {
          e.stopPropagation();
          setZoomOpen(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className={cn("object-cover", sizeClass)}
          onError={() => {
            setUrl(null);
            setFailed(true);
          }}
        />
        {showAiBadge ? (
          <span className="absolute bottom-1 right-1 rounded bg-emerald-600 px-1 py-px text-[0.5rem] font-bold uppercase leading-none tracking-wide text-white shadow-sm">
            AI
          </span>
        ) : null}
      </Button>
      {zoomOpen ? (
        <AiImageZoom src={url} onClose={() => setZoomOpen(false)} />
      ) : null}
    </>
  );
}
