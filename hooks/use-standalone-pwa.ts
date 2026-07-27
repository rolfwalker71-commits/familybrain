"use client";

import { useEffect, useState } from "react";

/**
 * True when the app runs as an installed PWA (display-mode: standalone / fullscreen).
 * Mobile Safari browser tabs and desktop stay false.
 */
export function useIsStandalonePwa(): boolean {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const iosStandalone =
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    const sync = () => setStandalone(mq.matches || iosStandalone);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return standalone;
}
