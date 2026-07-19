"use client";

import { useState } from "react";
import { ExternalLink, FileText, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconCircle } from "@/components/layout/icon-circle";

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

      <Dialog open={open} onOpenChange={setOpen}>
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
            <Button variant="outline" onClick={() => setOpen(false)}>
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
    </>
  );
}
