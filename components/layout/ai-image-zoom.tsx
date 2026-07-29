"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Fullscreen AI/image zoom via portal to document.body.
 * Closes on backdrop click, image click, or Escape.
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
    <button
      type="button"
      className="fixed inset-0 z-[2000] flex cursor-zoom-out items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      aria-label="Schliessen"
      title="Klicken zum Schliessen"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
      />
    </button>,
    document.body
  );
}
