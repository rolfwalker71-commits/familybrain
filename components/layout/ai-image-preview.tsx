"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandTone = "finance" | "travel";

const BRAND = {
  finance: {
    soft: "bg-[var(--brand-finance)]/90",
    text: "text-[var(--brand-finance)]",
  },
  travel: {
    soft: "bg-[var(--brand-docs)]/90",
    text: "text-[var(--brand-docs)]",
  },
} as const;

/**
 * Thumbnail + optional «Neu generieren» unter dem Preview
 * (wie in FinanzBuddy-Buchungen bei grosser AI-Ansicht).
 */
export function AiImagePreview({
  src,
  alt = "",
  busy = false,
  onOpen,
  onRegenerate,
  brand = "finance",
  imageClassName = "h-12 w-12 object-cover sm:h-14 sm:w-14",
  className,
}: {
  src: string;
  alt?: string;
  busy?: boolean;
  onOpen: () => void;
  onRegenerate?: () => void;
  brand?: BrandTone;
  imageClassName?: string;
  className?: string;
}) {
  const tone = BRAND[brand];
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-1",
        className
      )}
    >
      <button
        type="button"
        title="Tippen zum Vergrössern"
        className="relative overflow-hidden rounded-lg border border-border/50 shadow-sm"
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
      {onRegenerate ? (
        <button
          type="button"
          disabled={busy}
          title="KI-Bild neu erzeugen"
          className={cn(
            "inline-flex max-w-[5.5rem] items-center justify-center gap-0.5 text-center text-[10px] font-semibold leading-tight hover:underline disabled:opacity-50",
            tone.text
          )}
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate();
          }}
        >
          <RefreshCw
            className={cn("size-2.5 shrink-0", busy && "animate-spin")}
          />
          {busy ? "…" : "Neu generieren"}
        </button>
      ) : null}
    </div>
  );
}
