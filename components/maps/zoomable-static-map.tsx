"use client";

import { useEffect, useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readStoredMapZoom,
  writeStoredMapZoom,
} from "@/lib/maps/map-zoom-storage";

type Props = {
  /** Stabiler Schlüssel für localStorage (pro Ort/Route). */
  storageKey: string;
  defaultZoom: number;
  minZoom?: number;
  maxZoom?: number;
  /** Bild-URL für die aktuelle Zoomstufe. */
  srcForZoom: (zoom: number) => string;
  alt: string;
  heightClassName?: string;
  className?: string;
  /** Optional: Klick auf die Karte öffnet Link (Slider bleibt bedienbar). */
  href?: string | null;
  onImageError?: () => void;
};

/**
 * Static-Map mit Zoom-Slider; Zoom wird pro storageKey in localStorage gehalten.
 */
export function ZoomableStaticMap({
  storageKey,
  defaultZoom,
  minZoom = 8,
  maxZoom = 17,
  srcForZoom,
  alt,
  heightClassName = "h-28",
  className,
  href,
  onImageError,
}: Props) {
  const sliderId = useId();
  const [zoom, setZoom] = useState(() =>
    Math.min(maxZoom, Math.max(minZoom, defaultZoom))
  );

  useEffect(() => {
    const saved = readStoredMapZoom(storageKey);
    if (saved == null) return;
    setZoom(Math.min(maxZoom, Math.max(minZoom, Math.round(saved))));
  }, [storageKey, minZoom, maxZoom]);

  function applyZoom(next: number) {
    const z = Math.min(maxZoom, Math.max(minZoom, Math.round(next)));
    setZoom(z);
    writeStoredMapZoom(storageKey, z);
  }

  const src = srcForZoom(zoom);
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn("w-full object-cover", heightClassName)}
      loading="lazy"
      draggable={false}
      onError={onImageError}
    />
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-border/70 bg-muted/30",
        className
      )}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          {image}
        </a>
      ) : (
        image
      )}

      <div
        className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/55 via-black/35 to-transparent px-2 pb-1.5 pt-6"
        onClick={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-white/90 text-foreground shadow-sm hover:bg-white"
          aria-label="Herauszoomen"
          onClick={() => applyZoom(zoom - 1)}
          disabled={zoom <= minZoom}
        >
          <Minus className="size-3.5" aria-hidden />
        </button>
        <label htmlFor={sliderId} className="sr-only">
          Kartenzoom
        </label>
        <input
          id={sliderId}
          type="range"
          min={minZoom}
          max={maxZoom}
          step={1}
          value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-teal-700"
        />
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-white/90 text-foreground shadow-sm hover:bg-white"
          aria-label="Hereinzoomen"
          onClick={() => applyZoom(zoom + 1)}
          disabled={zoom >= maxZoom}
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
