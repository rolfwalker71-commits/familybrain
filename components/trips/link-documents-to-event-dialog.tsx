"use client";

import { useEffect, useRef, useState } from "react";
import { FilePlus2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DocOption = {
  id: number;
  title: string | null;
  original_file_name: string | null;
  correspondent_name: string | null;
  created_date: string | null;
};

type Props = {
  tripId: number;
  eventId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeDocumentIds?: number[];
  onLinked?: (message: string) => void;
  onError?: (message: string) => void;
};

export function LinkDocumentsToEventDialog({
  tripId,
  eventId,
  open,
  onOpenChange,
  excludeDocumentIds = [],
  onLinked,
  onError,
}: Props) {
  const [search, setSearch] = useState("");
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const excludeKey = excludeDocumentIds.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setSearch("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const exclude = new Set(
      excludeKey
        ? excludeKey.split(",").map((x) => Number(x)).filter((n) => n > 0)
        : []
    );
    const timer = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const params = new URLSearchParams({ limit: "80" });
          if (search.trim()) params.set("search", search.trim());
          const res = await fetch(
            `/api/trips/${tripId}/documents?${params}`
          );
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            throw new Error(data.error || "Dokumente laden fehlgeschlagen");
          }
          setDocs(
            ((data.documents || []) as DocOption[]).filter(
              (d) => !exclude.has(d.id)
            )
          );
        } catch (err) {
          if (!cancelled) {
            onError?.(err instanceof Error ? err.message : String(err));
            setDocs([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, excludeKey, onError, tripId]);

  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit() {
    if (selected.length === 0) {
      onError?.("Bitte mindestens einen Beleg wählen.");
      return;
    }
    setSaving(true);
    try {
      for (const documentId of selected) {
        const res = await fetch(
          `/api/trips/${tripId}/events/${eventId}/documents`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verlinken fehlgeschlagen");
      }
      onOpenChange(false);
      onLinked?.(
        selected.length === 1
          ? "Beleg verknüpft."
          : `${selected.length} Belege verknüpft.`
      );
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPdf(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", file.name.replace(/\.pdf$/i, ""));
      // Local TravelBuddy storage — no Paperless required.
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/attachments`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");
      onOpenChange(false);
      onLinked?.("PDF hochgeladen.");
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const busy = saving || uploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Belege & PDFs</DialogTitle>
          <DialogDescription>
            Eigenes PDF direkt zur Aktivität hochladen (ohne Paperless) oder ein
            bestehendes Paperless-Dokument verknüpfen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPdf(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-1.5"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              {uploading ? "Wird hochgeladen…" : "Eigenes PDF hochladen"}
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Wird lokal bei der Aktivität gespeichert (max. 40 MB) — kein
              Paperless nötig.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-search">Paperless-Dokumente verknüpfen</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="doc-search"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Titel, Dateiname…"
              />
            </div>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border/70 p-1.5">
            {loading ? (
              <p className="p-3 text-sm text-muted-foreground">Lädt…</p>
            ) : docs.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                Keine Paperless-Dokumente gefunden. Lade oben ein eigenes PDF
                hoch.
              </p>
            ) : (
              docs.map((doc) => {
                const checked = selected.includes(doc.id);
                const label =
                  doc.title?.trim() ||
                  doc.original_file_name?.trim() ||
                  `Dokument #${doc.id}`;
                return (
                  <label
                    key={doc.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggle(doc.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">
                        {label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[
                          doc.correspondent_name,
                          doc.created_date?.slice(0, 10),
                        ]
                          .filter(Boolean)
                          .join(" · ") || `ID ${doc.id}`}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button
            disabled={busy || selected.length === 0}
            onClick={() => void submit()}
            className="gap-1.5"
          >
            <FilePlus2 className="size-4" />
            {saving
              ? "Verknüpft…"
              : selected.length <= 1
                ? "Verknüpfen"
                : `${selected.length} verknüpfen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
