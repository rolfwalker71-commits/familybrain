"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type BrandTone = "finance" | "travel" | "docs";

/** Thumbnail only — tippen öffnet die Grossansicht (ohne AI-Badge). */
export function AiImagePreview({
  src,
  alt = "",
  onOpen,
  brand: _brand = "finance",
  imageClassName = "h-12 w-12 object-cover sm:h-14 sm:w-14",
  className,
}: {
  src: string;
  alt?: string;
  onOpen: () => void;
  /** Kept for call-site compatibility; badge removed. */
  brand?: BrandTone;
  imageClassName?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      title="Tippen zum Vergrössern"
      className={cn(
        "relative h-auto w-auto shrink-0 overflow-hidden rounded-lg border border-border/50 p-0 shadow-sm",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={imageClassName} />
    </Button>
  );
}
