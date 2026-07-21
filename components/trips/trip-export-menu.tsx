"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Link2,
  Mail,
  Printer,
  Share2,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";

type ShareLink = {
  id: number;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

type TripExportMenuProps = {
  tripId: number;
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  onStatus?: (msg: string) => void;
  onError?: (msg: string) => void;
};

function shareUrlForToken(token: string): string {
  if (typeof window === "undefined") return `/share/t/${token}`;
  return `${window.location.origin}/share/t/${token}`;
}

export function TripExportMenu({
  tripId,
  title,
  destination,
  startDate,
  endDate,
  onStatus,
  onError,
}: TripExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeLink = links.find((l) => !l.revoked_at) || null;

  const loadLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}/share`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Share-Links laden fehlgeschlagen");
      setLinks(data.links || []);
    } catch (err) {
      console.error(err);
    }
  }, [tripId]);

  useEffect(() => {
    if (!open) return;
    void loadLinks();
  }, [open, loadLinks]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function createShareLink() {
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Reise teilen" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Link erstellen fehlgeschlagen");
      await loadLinks();
      const url = shareUrlForToken(data.link.token);
      await navigator.clipboard.writeText(url);
      onStatus?.("Share-Link erstellt und kopiert.");
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyShareLink() {
    if (!activeLink) {
      await createShareLink();
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrlForToken(activeLink.token));
      onStatus?.("Share-Link kopiert.");
    } catch {
      onError?.("Kopieren fehlgeschlagen.");
    }
  }

  async function revokeShareLink() {
    if (!activeLink) return;
    if (!window.confirm("Share-Link wirklich widerrufen?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/share?shareId=${activeLink.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Widerrufen fehlgeschlagen");
      await loadLinks();
      onStatus?.("Share-Link widerrufen.");
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function mailPrepare() {
    const range =
      startDate && endDate && startDate !== endDate
        ? `${toSwissDate(startDate)} – ${toSwissDate(endDate)}`
        : startDate
          ? toSwissDate(startDate)
          : "";
    const shareLine = activeLink
      ? `\nOnline ansehen: ${shareUrlForToken(activeLink.token)}`
      : "\n(Optional: zuerst einen Share-Link erzeugen.)";
    const body = [
      `Reise: ${title}`,
      destination ? `Ziel: ${destination}` : null,
      range ? `Zeitraum: ${range}` : null,
      shareLine,
      "",
      "Bitte PDF oder HTML als Anhang manuell beifügen (Download in TravelBrain).",
    ]
      .filter(Boolean)
      .join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(
      `Reise: ${title}`
    )}&body=${encodeURIComponent(body)}`;
  }

  async function webShare() {
    const shareLine = activeLink
      ? shareUrlForToken(activeLink.token)
      : `${window.location.origin}/trips/${tripId}`;
    const text = [
      title,
      destination,
      startDate ? toSwissDate(startDate) : null,
      shareLine,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url: shareLine });
        onStatus?.("Geteilt.");
        return;
      }
      await navigator.clipboard.writeText(text);
      onStatus?.("Teilen nicht verfügbar — Text kopiert.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  const itemClass =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted";

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={busy}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Share2 className="size-4" />
        Export & Teilen
        <ChevronDown
          className={cn("size-3.5 opacity-70 transition", open && "rotate-180")}
        />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-[1200] min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <p className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Export
          </p>
          <a
            role="menuitem"
            href={`/api/trips/${tripId}/pdf`}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <Download className="size-4" />
            PDF herunterladen
          </a>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              window.open(`/trips/${tripId}/print?autoprint=1`, "_blank");
            }}
          >
            <Printer className="size-4" />
            Drucken
          </button>
          <a
            role="menuitem"
            href={`/api/trips/${tripId}/export.html`}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <FileText className="size-4" />
            HTML herunterladen
          </a>
          <a
            role="menuitem"
            href={`/api/trips/${tripId}/ics`}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <CalendarPlus className="size-4" />
            Alle Termine in Kalender
          </a>
          <div className="my-1 h-px bg-border" />
          <p className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Teilen
          </p>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => void copyShareLink()}
          >
            <Link2 className="size-4" />
            {activeLink ? "Share-Link kopieren" : "Share-Link erzeugen"}
          </button>
          {activeLink ? (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => void revokeShareLink()}
            >
              <Trash2 className="size-4" />
              Share-Link widerrufen
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              mailPrepare();
            }}
          >
            <Mail className="size-4" />
            Per Mail vorbereiten
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => void webShare()}
          >
            <Copy className="size-4" />
            Teilen…
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TripIcsLink({ tripId }: { tripId: number }) {
  return (
    <a
      href={`/api/trips/${tripId}/ics`}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <CalendarPlus className="mr-1.5 size-4" />
      Alle Termine in Kalender
    </a>
  );
}
