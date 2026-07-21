"use client";

import { useEffect, useRef } from "react";

export function TripPrintClient({
  html,
  autoPrint,
}: {
  html: string;
  autoPrint?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!autoPrint) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const run = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      }
    };

    iframe.addEventListener("load", run);
    // srcDoc may already be loaded
    const t = window.setTimeout(run, 500);
    return () => {
      iframe.removeEventListener("load", run);
      window.clearTimeout(t);
    };
  }, [autoPrint, html]);

  return (
    <iframe
      ref={iframeRef}
      title="Reise drucken"
      srcDoc={html}
      className="fixed inset-0 h-dvh w-full border-0 bg-white"
    />
  );
}
