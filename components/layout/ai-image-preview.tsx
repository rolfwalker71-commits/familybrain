"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandTone = "finance" | "travel" | "docs";

const BRAND = {
  finance: {
    soft: "bg-[var(--brand-finance)]/90",
  },
  travel: {
    soft: "bg-[var(--brand-docs)]/90",
  },
  docs: {
    soft: "bg-[var(--brand-docs)]/90",
  },
} as const;

/** Thumbnail only — «Neu generieren» gehört in die Grossansicht. */
export function AiImagePreview({
  src,
  alt = "",
  onOpen,
  brand = "finance",
  imageClassName = "h-12 w-12 object-cover sm:h-14 sm:w-14",
  className,
}: {
  src: string;
  alt?: string;
  onOpen: () => void;
  brand?: BrandTone;
  imageClassName?: string;
  className?: string;
}) {
  const tone = BRAND[brand];
  return (
    <button
      type="button"
      title="Tippen zum Vergrössern"
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border border-border/50 shadow-sm",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={imageClassName} />
      <span
        className={cn(
          "absolute right-0.5 top-0.5 inline-flex items-center gap-0.5 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide text-white",
          tone.soft
        )}
      >
        <Sparkles className="size-2.5" />
        AI
      </span>
    </button>
  );
}
