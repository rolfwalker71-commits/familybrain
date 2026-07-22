"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ExpenseReceiptControls({
  expenseId,
  receiptUrl,
  uploadUrl,
  onChanged,
  compact,
}: {
  expenseId: number;
  receiptUrl?: string | null;
  uploadUrl: string;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload fehlgeschlagen");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm("Foto entfernen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(uploadUrl, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Löschen fehlgeschlagen");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", compact ? "" : "mt-1")}>
      <div className="flex flex-wrap items-center gap-1">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {receiptUrl ? (
          <>
            <button
              type="button"
              className="overflow-hidden rounded border border-border/60"
              onClick={() => setPreviewOpen(true)}
              title="Foto anzeigen"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptUrl}
                alt={`Beleg ${expenseId}`}
                className="h-10 w-10 object-cover"
              />
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="mr-1 size-3.5" />
              Ersetzen
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="mr-1 size-3.5" />
            Foto
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {previewOpen && receiptUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewOpen(false)}
          role="dialog"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded bg-black/50 p-2 text-white"
            onClick={() => setPreviewOpen(false)}
            aria-label="Schliessen"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={receiptUrl}
            alt={`Beleg ${expenseId}`}
            className="max-h-[90vh] max-w-full rounded object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PendingReceiptPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Camera className="mr-1 size-3.5" />
          {file ? "Foto ändern" : "Foto anhängen"}
        </Button>
        {file ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="size-3.5" />
            {file.name}
            <button
              type="button"
              className="text-destructive hover:underline"
              onClick={() => {
                onChange(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Entfernen
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Kamera oder Galerie
          </span>
        )}
      </div>
    </div>
  );
}
