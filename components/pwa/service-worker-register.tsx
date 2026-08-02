"use client";

import { useEffect } from "react";

/** Registers /sw.js early so Push subscribe on Windows/Desktop is reliable. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    let cancelled = false;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.register(
          "/sw.js?v=push-media-v3",
          {
            scope: "/",
            updateViaCache: "none",
          }
        );
        if (cancelled) return;
        await reg.update().catch(() => {
          /* optional */
        });
      } catch {
        /* ignore offline / unsupported */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
