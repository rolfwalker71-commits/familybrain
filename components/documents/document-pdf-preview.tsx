"use client";

import { useState } from "react";
import { FileText, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
          <CardTitle className="text-base">PDF-Vorschau</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
            Öffnen
          </Button>
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
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              Klicken für Vollansicht
            </div>
          </button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex h-[90vh] w-[min(1100px,95vw)] max-w-none flex-col gap-3 p-4 sm:max-w-none"
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
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              In neuem Tab öffnen
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
