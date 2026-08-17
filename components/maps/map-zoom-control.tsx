"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
  className?: string;
};

/**
 * Kompakter vertikaler Zoom-Regler (links auf der Karte).
 * Range ist per CSS gedreht; Plus oben, Minus unten.
 */
export function MapZoomControl({
  id,
  zoom,
  minZoom,
  maxZoom,
  onZoomChange,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col items-center gap-0.5 rounded-md bg-white/90 p-0.5 shadow-sm ring-1 ring-black/10",
        className
      )}
      onClick={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-5 shrink-0 rounded text-foreground hover:bg-black/5 disabled:opacity-40"
        aria-label="Hereinzoomen"
        onClick={() => onZoomChange(zoom + 1)}
        disabled={zoom >= maxZoom}
      >
        <Plus className="size-3" aria-hidden />
      </Button>
      <label htmlFor={id} className="sr-only">
        Kartenzoom
      </label>
      <div className="relative flex h-14 w-5 items-center justify-center sm:h-16">
        <input
          id={id}
          type="range"
          min={minZoom}
          max={maxZoom}
          step={1}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="map-zoom-range absolute h-5 w-14 origin-center -rotate-90 cursor-pointer sm:w-16"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-5 shrink-0 rounded text-foreground hover:bg-black/5 disabled:opacity-40"
        aria-label="Herauszoomen"
        onClick={() => onZoomChange(zoom - 1)}
        disabled={zoom <= minZoom}
      >
        <Minus className="size-3" aria-hidden />
      </Button>
    </div>
  );
}
