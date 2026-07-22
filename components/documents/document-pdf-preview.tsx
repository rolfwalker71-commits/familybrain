"use client";

import { useState } from "react";
import { ExternalLink, FileText, Maximize2, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconCircle } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

function PdfPreviewDialog({
  open,
  onOpenChange,
  paperlessId,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperlessId: number;
  title?: string | null;
}) {
  const pdfUrl = `/api/paperless/documents/${paperlessId}/file?type=pdf`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-dvh w-screen max-w-none flex-col gap-3 rounded-none p-3 sm:h-[90dvh] sm:w-[min(1100px,95vw)] sm:max-w-none sm:rounded-xl sm:p-4"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {title || `Dokument ${paperlessId}`}
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
  title,
  href,
  className,
  onRemove,
  removing,
  size = "default",
}: {
  paperlessId: number;
  title?: string | null;
  /** Optional link under the thumb (e.g. document detail page) */
  href?: string;
  className?: string;
  /** Show remove control to unlink from event */
  onRemove?: () => void;
  removing?: boolean;
  /** `square` matches compact AI thumbs (3.5rem). */
  size?: "default" | "square";
}) {
  const [open, setOpen] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const thumbUrl = `/api/paperless/documents/${paperlessId}/file?type=thumb`;
  const square = size === "square";

  return (
    <div
      className={cn(
        "relative shrink-0",
        square ? "h-14 w-14" : "w-14",
        className
      )}
      style={square ? undefined : { width: "3.5rem" }}
    >
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          disabled={removing}
          title="Verknüpfung entfernen"
          className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
        >
          <XIcon className="size-3" />
          <span className="sr-only">Verknüpfung entfernen</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title || "PDF öffnen"}
        className="group relative block h-full w-full overflow-hidden rounded-md border border-border/70 bg-muted/40 text-left transition-colors hover:bg-muted"
      >
        {!thumbError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
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
            <span className="px-0.5 text-center text-[9px] leading-tight">
              PDF
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-gradient-to-t from-black/55 to-transparent px-0.5 py-1 text-[9px] text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <Maximize2 className="size-2.5" />
          Öffnen
        </div>
      </button>
      {!square && (title || href) ? (
        <div className="mt-0.5 truncate text-[9px] leading-tight text-muted-foreground">
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
      <PdfPreviewDialog
        open={open}
        onOpenChange={setOpen}
        paperlessId={paperlessId}
        title={title}
      />
    </div>
  );
}

export function DocumentPdfPreview({
  paperlessId,
  title,
}: {
  paperlessId: number;
  title?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const thumbUrl = `/api/paperless/documents/${paperlessId}/file?type=thumb`;
  const pdfUrl = `/api/paperless/documents/${paperlessId}/file?type=pdf`;

  return (
    <>
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={FileText} tone="blue" size="sm" />
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
        <CardContent>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative w-full overflow-hidden rounded-lg border border-border bg-muted/40 text-left transition-colors hover:bg-muted"
          >
            {!thumbError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl}
                alt={title || "PDF Vorschau"}
                className="mx-auto max-h-64 object-contain"
                onError={() => setThumbError(true)}
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileText className="h-8 w-8" />
                <span className="text-sm">Vorschau klicken · PDF öffnen</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2 text-xs text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              Klicken für Vollansicht
            </div>
          </button>
        </CardContent>
      </Card>

      <PdfPreviewDialog
        open={open}
        onOpenChange={setOpen}
        paperlessId={paperlessId}
        title={title}
      />
    </>
  );
}
