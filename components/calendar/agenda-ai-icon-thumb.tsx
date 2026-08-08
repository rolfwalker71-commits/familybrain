"use client";

import { useEffect, useState } from "react";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
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
}) {
  const [url, setUrl] = useState<string | null>(aiIconUrl ?? null);
  const [loading, setLoading] = useState(
    () => !aiIconUrl && Boolean(aiIconKey || title?.trim())
  );
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    setUrl(aiIconUrl ?? null);
  }, [aiIconUrl]);

  useEffect(() => {
    if (url) return;
    if (!aiIconKey && !title?.trim()) return;

    let cancelled = false;
    setLoading(true);
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
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const fromId = data.byId?.[itemId]?.url as string | undefined;
        const fromPropKey = aiIconKey
          ? (data.byKey?.[aiIconKey] as string | undefined)
          : undefined;
        const fromAnyKey = Object.values(
          (data.byKey || {}) as Record<string, string>
        )[0];
        const next = fromId || fromPropKey || fromAnyKey || null;
        if (next) setUrl(next);
      } catch {
        /* optional */
      } finally {
        if (!cancelled) setLoading(false);
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

  if (!url && !aiIconKey && !loading) return null;

  if (!url) {
    return (
      <span
        className={cn(
          "shrink-0 animate-pulse rounded-lg bg-muted/70",
          imgClassName || "size-12 sm:size-14",
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
          setZoomOpen(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className={cn("object-cover", imgClassName || "size-12 sm:size-14")}
        />
      </button>
      {zoomOpen ? (
        <AiImageZoom src={url} onClose={() => setZoomOpen(false)} />
      ) : null}
    </>
  );
}
