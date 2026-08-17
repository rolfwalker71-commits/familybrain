"use client";

import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Horizontal snap carousel for detail overlays (swipe on touch, arrows on desktop).
 */
export function DetailCarousel({
  children,
  className,
  slideClassName,
  resetKey,
  initialIndex = 0,
}: {
  children: ReactNode;
  className?: string;
  slideClassName?: string;
  /** Change to reset scroll (e.g. when opening another item or target slide). */
  resetKey?: string | number;
  /** Slide to show after reset (clamped to available slides). */
  initialIndex?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children).filter(Boolean);
  const count = slides.length;
  const startIndex = Math.max(0, Math.min(count - 1, initialIndex || 0));
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    const target = Math.max(0, Math.min(count - 1, initialIndex || 0));
    setIndex(target);
    const el = scrollerRef.current;
    if (!el) return;
    // Wait a frame so layout width is known after dialog open.
    const id = requestAnimationFrame(() => {
      el.scrollTo({ left: target * el.clientWidth });
    });
    return () => cancelAnimationFrame(id);
  }, [resetKey, initialIndex, count]);

  const syncIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth <= 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.max(0, Math.min(count - 1, next)));
  }, [count]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", syncIndex, { passive: true });
    window.addEventListener("resize", syncIndex);
    return () => {
      el.removeEventListener("scroll", syncIndex);
      window.removeEventListener("resize", syncIndex);
    };
  }, [syncIndex]);

  function goTo(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(count - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  }

  if (count === 0) return null;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className={cn(
              "min-h-0 w-full shrink-0 snap-center snap-always overflow-y-auto px-1",
              slideClassName
            )}
          >
            {slide}
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-2 px-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0"
            disabled={index <= 0}
            aria-label="Zurück"
            onClick={() => goTo(index - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Seiten">
            {slides.map((_, i) => (
              <Button
                key={i}
                type="button"
                variant="ghost"
                size="icon-xs"
                role="tab"
                aria-selected={i === index}
                aria-label={`Seite ${i + 1}`}
                className={cn(
                  "size-1.5 min-h-0 min-w-0 shrink-0 rounded-full p-0 transition-colors hover:bg-transparent",
                  i === index
                    ? "bg-[var(--brand-finance)]"
                    : "bg-muted-foreground/30"
                )}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0"
            disabled={index >= count - 1}
            aria-label="Weiter"
            onClick={() => goTo(index + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
