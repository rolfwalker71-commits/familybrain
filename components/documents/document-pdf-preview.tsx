"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileText, Maximize2, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
import { IconCircle } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

function PdfPreviewDialog({
  open,
  onOpenChange,
  pdfUrl,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string;
  title?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-dvh w-screen max-w-none flex-col gap-3 rounded-none p-3 sm:h-[90dvh] sm:w-[min(1100px,95vw)] sm:max-w-none sm:rounded-xl sm:p-4"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {title || "PDF"}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
          <iframe
            title={title || "PDF"}
            src={pdfUrl}
            className="h-full w-full"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schliessen
          </Button>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            In neuem Tab öffnen
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Compact PDF thumbnail for cards — click opens enlarge dialog. */
export function DocumentPdfThumb({
  paperlessId,
  pdfUrl,
  thumbUrl,
  title,
  href,
  className,
  onRemove,
  removing,
  size = "default",
  /**
   * Hover (desktop) opens thumbnail zoom lightbox; click on zoom closes it.
   * Useful for comparing duplicates side-by-side without leaving the list.
   */
  zoomOnHover = false,
}: {
  /** Paperless document id (legacy). Prefer pdfUrl for local files. */
  paperlessId?: number;
  /** Direct PDF URL (local attachment or paperless proxy). */
  pdfUrl?: string;
  /** Optional thumbnail URL; without it a PDF icon is shown. */
  thumbUrl?: string | null;
  title?: string | null;
  /** Optional link under the thumb (e.g. document detail page) */
  href?: string;
  className?: string;
  /** Show remove control to unlink from event */
  onRemove?: () => void;
  removing?: boolean;
  /** `square` matches compact AI thumbs (3.5rem). */
  size?: "default" | "square";
  zoomOnHover?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const resolvedPdf =
    pdfUrl ||
    (paperlessId != null
      ? `/api/paperless/documents/${paperlessId}/file?type=pdf`
      : null);
  const resolvedThumb =
    thumbUrl !== undefined
      ? thumbUrl
      : paperlessId != null
        ? `/api/paperless/documents/${paperlessId}/file?type=thumb`
        : null;
  const square = size === "square";
  const canZoomHover =
    zoomOnHover && Boolean(resolvedThumb) && !thumbError;

  function clearHoverTimer() {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function scheduleZoomOpen() {
    if (!canZoomHover) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      setZoomOpen(true);
      hoverTimer.current = null;
    }, 180);
  }

  if (!resolvedPdf) return null;

  return (
    <div
      className={cn(
        "relative shrink-0",
        square ? "h-14 w-14" : "w-14",
        className
      )}
      style={square ? undefined : { width: "3.5rem" }}
      onMouseEnter={canZoomHover ? scheduleZoomOpen : undefined}
      onMouseLeave={canZoomHover ? clearHoverTimer : undefined}
    >
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          disabled={removing}
          title="Entfernen"
          className="absolute -right-1.5 -top-1.5 z-10 size-5 rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
        >
          <XIcon className="size-3" />
          <span className="sr-only">Entfernen</span>
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          clearHoverTimer();
          if (canZoomHover && resolvedThumb && !thumbError) {
            setZoomOpen(true);
            return;
          }
          setOpen(true);
        }}
        title={
          canZoomHover
            ? "Hover oder Tippen für Zoom · Klick auf Zoom schliesst"
            : title || "PDF öffnen"
        }
        className={cn(
          "group relative block h-full w-full overflow-hidden rounded-md border border-border/70 bg-muted/40 p-0 text-left transition-colors hover:bg-muted",
          canZoomHover && "cursor-zoom-in"
        )}
      >
        {resolvedThumb && !thumbError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedThumb}
            alt={title || "PDF Vorschau"}
            className={cn(
              "w-full object-cover object-top",
              square ? "h-14" : "h-20"
            )}
            onError={() => setThumbError(true)}
          />
        ) : (
          <div
            className={cn(
              "flex w-full flex-col items-center justify-center gap-0.5 text-muted-foreground",
              square ? "h-14" : "h-20"
            )}
          >
            <FileText className="size-4" />
            <span className="px-0.5 text-center text-[0.5625rem] leading-tight">
              PDF
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-gradient-to-t from-black/55 to-transparent px-0.5 py-1 text-[0.5625rem] text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <Maximize2 className="size-2.5" />
          {canZoomHover ? "Zoom" : "Öffnen"}
        </div>
      </Button>
      {!square && (title || href) ? (
        <div className="mt-0.5 truncate text-[0.5625rem] leading-tight text-muted-foreground">
          {href ? (
            <a
              href={href}
              className="underline-offset-2 hover:underline"
              title={title || undefined}
            >
              {title || "Dokument"}
            </a>
          ) : (
            <span title={title || undefined}>{title}</span>
          )}
        </div>
      ) : null}
      {zoomOpen && resolvedThumb && !thumbError ? (
        <AiImageZoom
          src={resolvedThumb}
          alt={title || "PDF Vorschau"}
          onClose={() => setZoomOpen(false)}
        />
      ) : null}
      <PdfPreviewDialog
        open={open}
        onOpenChange={setOpen}
        pdfUrl={resolvedPdf}
        title={title}
      />
    </div>
  );
}

export function DocumentPdfPreview({
  paperlessId,
  title,
  className,
  fillHeight = false,
}: {
  paperlessId: number;
  title?: string | null;
  className?: string;
  /** Stretch card to parent height (e.g. overview two-column layout). */
  fillHeight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const thumbUrl = `/api/paperless/documents/${paperlessId}/file?type=thumb`;
  const pdfUrl = `/api/paperless/documents/${paperlessId}/file?type=pdf`;

  return (
    <div className={cn(fillHeight && "flex h-full min-h-0 flex-col", className)}>
      <Card
        className={cn(
          "border-border/80 shadow-sm",
          fillHeight && "flex h-full min-h-0 flex-col"
        )}
      >
        <CardHeader className="flex shrink-0 flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={FileText} tone="teal" size="sm" />
            PDF-Vorschau
          </CardTitle>
          <div className="flex items-center gap-2">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 md:hidden"
            >
              <ExternalLink className="size-4" />
              PDF
            </a>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              className="hidden md:inline-flex"
            >
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Vorschau
            </Button>
          </div>
        </CardHeader>
        <CardContent
          className={cn(fillHeight && "flex min-h-0 flex-1 flex-col")}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(true)}
            className={cn(
              "group relative h-auto w-full overflow-hidden rounded-lg border border-border bg-muted/40 p-0 text-left transition-colors hover:bg-muted",
              fillHeight &&
                "flex min-h-[12rem] flex-1 items-center justify-center"
            )}
          >
            {!thumbError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl}
                alt={title || "PDF Vorschau"}
                className={cn(
                  "mx-auto object-contain",
                  fillHeight ? "max-h-full w-full" : "max-h-64"
                )}
                onError={() => setThumbError(true)}
              />
            ) : (
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-2 text-muted-foreground",
                  fillHeight ? "min-h-[12rem] flex-1" : "h-48"
                )}
              >
                <FileText className="h-8 w-8" />
                <span className="text-sm">Vorschau klicken · PDF öffnen</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2 text-xs text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              Klicken für Vollansicht
            </div>
          </Button>
        </CardContent>
      </Card>

      <PdfPreviewDialog
        open={open}
        onOpenChange={setOpen}
        pdfUrl={pdfUrl}
        title={title}
      />
    </div>
  );
}
