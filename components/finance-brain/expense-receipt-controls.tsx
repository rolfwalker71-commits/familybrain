"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Camera, Image as ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiImageZoom } from "@/components/layout/ai-image-zoom";
import { cn } from "@/lib/utils";

export type ExpenseReceiptControlsHandle = {
  pickFile: () => void;
  openPreview: () => void;
  remove: () => Promise<void>;
  busy: boolean;
};

export const ExpenseReceiptControls = forwardRef<
  ExpenseReceiptControlsHandle,
  {
    expenseId: number;
    receiptUrl?: string | null;
    uploadUrl: string;
    onChanged?: () => void;
    compact?: boolean;
    /** Hide button chrome; use ref / thumb for menu-driven UIs. */
    triggerOnly?: boolean;
  }
>(function ExpenseReceiptControls(
  {
    expenseId,
    receiptUrl,
    uploadUrl,
    onChanged,
    compact,
    triggerOnly,
  },
  ref
) {
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

  useImperativeHandle(
    ref,
    () => ({
      pickFile: () => fileRef.current?.click(),
      openPreview: () => {
        if (receiptUrl) setPreviewOpen(true);
      },
      remove,
      busy,
    }),
    [busy, receiptUrl, uploadUrl, onChanged]
  );

  return (
    <div className={cn("flex flex-col gap-1", compact || triggerOnly ? "" : "mt-1")}>
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

      {triggerOnly ? (
        receiptUrl ? (
          <Button
            type="button"
            variant="ghost"
            className="h-auto overflow-hidden rounded border border-border p-0"
            onClick={() => setPreviewOpen(true)}
            title="Foto anzeigen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptUrl}
              alt={`Beleg ${expenseId}`}
              className="h-8 w-8 object-cover"
            />
          </Button>
        ) : null
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {receiptUrl ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-auto overflow-hidden rounded border border-border/60 p-0"
                onClick={() => setPreviewOpen(true)}
                title="Foto anzeigen"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receiptUrl}
                  alt={`Beleg ${expenseId}`}
                  className="h-10 w-10 object-cover"
                />
              </Button>
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
      )}
      {error && !triggerOnly ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}

      {previewOpen && receiptUrl ? (
        <AiImageZoom
          src={receiptUrl}
          alt={`Beleg ${expenseId}`}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
});

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
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-destructive"
              onClick={() => {
                onChange(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Entfernen
            </Button>
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
