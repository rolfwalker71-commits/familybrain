"use client";

import { useState } from "react";
import { AiImagePreview } from "@/components/layout/ai-image-preview";
import {
  IconCircle,
  knowledgeVisual,
} from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE: Record<
  Size,
  { image: string; circle: "sm" | "md" | "lg"; wrap: string }
> = {
  xs: {
    image: "h-8 w-8 object-cover",
    circle: "sm",
    wrap: "size-8",
  },
  sm: {
    image: "h-10 w-10 object-cover",
    circle: "sm",
    wrap: "size-10",
  },
  md: {
    image: "h-12 w-12 object-cover sm:h-14 sm:w-14",
    circle: "lg",
    wrap: "size-12 sm:size-14",
  },
  lg: {
    image: "h-16 w-16 object-cover sm:h-[4.5rem] sm:w-[4.5rem]",
    circle: "lg",
    wrap: "size-16 sm:size-[4.5rem]",
  },
};

function ZoomLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      aria-label="Schliessen"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </button>
  );
}

/**
 * Shared document visual: generated AI icon, or category/fallback circle.
 * AI icons open a zoom lightbox on tap.
 */
export function DocumentAiIcon({
  aiIconUrl,
  category,
  size = "sm",
  className,
  onOpen,
  zoomable = true,
}: {
  aiIconUrl?: string | null;
  category?: string | null;
  size?: Size;
  className?: string;
  onOpen?: (url: string) => void;
  /** When true (default), tapping an AI icon opens a fullscreen zoom. */
  zoomable?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const dim = SIZE[size];

  if (aiIconUrl) {
    return (
      <>
        <span className={cn("relative shrink-0", dim.wrap, className)}>
          <AiImagePreview
            src={aiIconUrl}
            brand="docs"
            alt=""
            imageClassName={dim.image}
            onOpen={() => {
              if (onOpen) onOpen(aiIconUrl);
              else if (zoomable) setZoom(true);
            }}
          />
        </span>
        {zoom ? (
          <ZoomLightbox src={aiIconUrl} onClose={() => setZoom(false)} />
        ) : null}
      </>
    );
  }

  const visual = knowledgeVisual(category || "Sonstiges");
  return (
    <IconCircle
      icon={visual.icon}
      tone="teal"
      size={dim.circle}
      className={cn("shrink-0 rounded-xl", className)}
    />
  );
}
