"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DocumentInfoButtonProps = {
  documentId: number;
  label?: string;
  className?: string;
  size?: "default" | "sm" | "icon" | "icon-sm";
  variant?: "default" | "outline" | "secondary" | "ghost";
};

/** Explicit entry into the full document detail view. */
export function DocumentInfoButton({
  documentId,
  label = "Info",
  className,
  size = "sm",
  variant = "outline",
}: DocumentInfoButtonProps) {
  const iconOnly = size === "icon" || size === "icon-sm";
  return (
    <Link
      href={`/documents/${documentId}`}
      className={cn(buttonVariants({ variant, size }), className)}
      title="Dokument-Detail öffnen"
    >
      <Info className="h-4 w-4" />
      {iconOnly ? (
        <span className="sr-only">Info</span>
      ) : (
        <span>{label}</span>
      )}
    </Link>
  );
}

type DocumentTitleLinkProps = {
  documentId: number;
  title?: string | null;
  className?: string;
  fallback?: string;
};

/** Clickable document title → same detail page as under Dokumente. */
export function DocumentTitleLink({
  documentId,
  title,
  className,
  fallback,
}: DocumentTitleLinkProps) {
  const text = title?.trim() || fallback || `Dokument #${documentId}`;
  return (
    <Link
      href={`/documents/${documentId}`}
      className={cn(
        "block break-words font-medium text-foreground underline-offset-2 hover:underline",
        className
      )}
      title={text}
    >
      {text}
    </Link>
  );
}
