"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, MessageCircle, Pencil, Trash2, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateDe } from "@/lib/finance-brain/format";
import { cn } from "@/lib/utils";

export type EventComment = {
  id: number;
  author_name: string;
  body: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
};

type Props = {
  tripId: number;
  eventId: number;
  readOnly?: boolean;
  shareToken?: string;
  className?: string;
  onCountChange?: (count: number) => void;
};

function formatCommentWhen(iso: string): string {
  const datePart = iso.slice(0, 10);
  const timePart = iso.includes("T") ? iso.slice(11, 16) : "";
  const de = formatDateDe(datePart) || datePart;
  return timePart ? `${de} · ${timePart}` : de;
}

export function EventDiaryPanel({
  tripId,
  eventId,
  readOnly = false,
  shareToken,
  className,
  onCountChange,
}: Props) {
  const [comments, setComments] = useState<EventComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const listUrl = shareToken
    ? `/api/share/t/${encodeURIComponent(shareToken)}/events/${eventId}/comments`
    : `/api/trips/${tripId}/events/${eventId}/comments`;

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kommentare laden fehlgeschlagen");
      const list = (data.comments || []) as EventComment[];
      setComments(list);
      onCountChangeRef.current?.(list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setComments([]);
      onCountChangeRef.current?.(0);
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function submitNew() {
    if (readOnly || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("body", body.trim());
      if (imageFile) form.set("image", imageFile);
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/comments`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setBody("");
      setImageFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(commentId: number) {
    if (!editBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/comments/${commentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: editBody.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Aktualisieren fehlgeschlagen");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(commentId: number) {
    if (!window.confirm("Kommentar löschen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/comments/${commentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MessageCircle className="size-4 text-muted-foreground" />
        Tagebuch
        {comments.length > 0 ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {comments.length}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Kommentare.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-border/60 bg-background/80 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {c.author_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCommentWhen(c.created_at)}
                    {c.updated_at !== c.created_at ? " · bearbeitet" : ""}
                  </p>
                </div>
                {!readOnly && c.can_edit ? (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      title="Bearbeiten"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(c.id);
                        setEditBody(c.body);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      title="Löschen"
                      disabled={busy}
                      onClick={() => void removeComment(c.id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ) : null}
              </div>

              {editingId === c.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    className="min-h-20 text-sm"
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !editBody.trim()}
                      onClick={() => void saveEdit(c.id)}
                    >
                      Speichern
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {c.body}
                </p>
              )}

              {c.image_url ? (
                <button
                  type="button"
                  className="mt-2 block overflow-hidden rounded-lg border border-border/50"
                  onClick={() => setZoomUrl(c.image_url)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image_url}
                    alt=""
                    className="max-h-40 w-auto max-w-full object-cover"
                  />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!readOnly ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Kommentar hinzufügen…"
            rows={3}
            className="min-h-20 bg-background text-sm"
            maxLength={2000}
            disabled={busy}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setImageFile(file);
            }}
          />
          {previewUrl ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="h-20 w-20 rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background shadow-sm"
                onClick={() => {
                  setImageFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-3.5" />
              Bild
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={busy || !body.trim()}
              onClick={() => void submitNew()}
            >
              <MessageCircle className="size-3.5" />
              {busy ? "Speichert…" : "Kommentieren"}
            </Button>
          </div>
        </div>
      ) : null}

      {zoomUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt=""
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
          />
        </button>
      ) : null}
    </div>
  );
}

/** Compact count chip for timeline cards. */
export function CommentCountChip({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (!(count > 0)) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground",
        className
      )}
      title={`${count} Kommentar${count === 1 ? "" : "e"}`}
    >
      <MessageCircle className="size-3" />
      {count}
    </span>
  );
}
