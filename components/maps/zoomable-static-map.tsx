"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import {
  readStoredMapZoom,
  writeStoredMapZoom,
} from "@/lib/maps/map-zoom-storage";
import { MapZoomControl } from "@/components/maps/map-zoom-control";

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

      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-1.5">
        <MapZoomControl
          id={sliderId}
          zoom={zoom}
          minZoom={minZoom}
          maxZoom={maxZoom}
          onZoomChange={applyZoom}
        />
      </div>
    </div>
  );
}
