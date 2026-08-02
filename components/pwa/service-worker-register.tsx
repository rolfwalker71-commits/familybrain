"use client";

import { useEffect } from "react";

/** Registers /sw.js once; enables notificationclick + future push. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore offline / unsupported */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
