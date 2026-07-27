"use client";

import { useEffect, useState } from "react";

function resolveScrollRoot(): HTMLElement | Window {
  if (typeof document === "undefined") return window;
  const main = document.querySelector("main");
  if (main instanceof HTMLElement) {
    const overflowY = getComputedStyle(main).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return main;
  }
  return window;
}

function stickyProbeOffset(): number {
  // Prefer sticky chrome height; fall back to a band below the mobile header.
  const sticky = document.querySelector<HTMLElement>("[data-sticky-detail-chrome]");
  if (sticky) {
    const bottom = sticky.getBoundingClientRect().bottom;
    if (bottom > 0) return bottom + 12;
  }
  return 120;
}

/**
 * Tracks which day-anchor is currently at the top of the scroll viewport
 * (accounts for sticky detail chrome).
 */
export function useActiveDateFromScroll(
  dates: string[],
  anchorIdForDate: (isoDate: string) => string
): string | null {
  const [activeDate, setActiveDate] = useState<string | null>(null);

  useEffect(() => {
    if (dates.length === 0) {
      setActiveDate(null);
      return;
    }

    let frame = 0;

    const update = () => {
      const offset = stickyProbeOffset();
      let current: string | null = null;
      for (const iso of dates) {
        const el = document.getElementById(anchorIdForDate(iso));
        if (!el) continue;
        if (el.getBoundingClientRect().top <= offset) current = iso;
      }
      // Before any day has reached the sticky band, highlight the first in DOM order.
      if (!current) {
        for (const iso of dates) {
          if (document.getElementById(anchorIdForDate(iso))) {
            current = iso;
            break;
          }
        }
      }
      setActiveDate((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    const root = resolveScrollRoot();
    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [dates, anchorIdForDate]);

  return activeDate;
}
