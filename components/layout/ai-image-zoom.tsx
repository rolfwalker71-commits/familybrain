"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Fullscreen AI/image zoom via portal to document.body.
 * Closes on backdrop click, image click, or Escape.
 * Uses shadcn Button for the dismiss layer (focus/touch consistency).
 */
export function AiImageZoom({
  src,
  alt = "",
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <Button
      type="button"
      variant="ghost"
      className="fixed inset-0 z-[2000] flex h-dvh w-screen max-w-none cursor-zoom-out items-center justify-center rounded-none border-0 bg-black/80 p-4 hover:bg-black/80"
      onClick={onClose}
      aria-label="Schliessen"
      title="Klicken zum Schliessen"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-[min(49dvh,49vw)] w-[min(49dvh,49vw)] max-h-[49dvh] max-w-[49vw] rounded-lg object-contain shadow-2xl"
      />
    </Button>,
    document.body
  );
}
