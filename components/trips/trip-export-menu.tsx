"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarPlus,
  Copy,
  Download,
  FileText,
  Link2,
  Mail,
  Printer,
  Share2,
  Trash2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);

  const activeLink = links.find((l) => !l.revoked_at) || null;

  const loadLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}/share`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Share-Links laden fehlgeschlagen");
      setLinks(data.links || []);
    } catch (err) {
      // Non-fatal on open
      console.error(err);
    }
  }, [tripId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

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
    const href = `mailto:?subject=${encodeURIComponent(
      `Reise: ${title}`
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
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
        let files: File[] | undefined;
        try {
          const pdfRes = await fetch(`/api/trips/${tripId}/pdf`);
          if (pdfRes.ok) {
            const blob = await pdfRes.blob();
            const file = new File([blob], `reise-${tripId}.pdf`, {
              type: "application/pdf",
            });
            if (
              !navigator.canShare ||
              navigator.canShare({ files: [file] })
            ) {
              files = [file];
            }
          }
        } catch {
          /* text-only share */
        }
        await navigator.share(
          files
            ? { title, text, url: shareLine, files }
            : { title, text, url: shareLine }
        );
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5"
        )}
      >
        <Share2 className="size-4" />
        Export & Teilen
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Export</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            window.location.href = `/api/trips/${tripId}/pdf`;
          }}
        >
          <Download className="size-4" />
          PDF herunterladen
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.open(`/trips/${tripId}/print?autoprint=1`, "_blank");
          }}
        >
          <Printer className="size-4" />
          Drucken
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.location.href = `/api/trips/${tripId}/export.html`;
          }}
        >
          <FileText className="size-4" />
          HTML herunterladen
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.location.href = `/api/trips/${tripId}/ics`;
          }}
        >
          <CalendarPlus className="size-4" />
          Alle Termine in Kalender
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Teilen</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => void copyShareLink()}>
          <Link2 className="size-4" />
          {activeLink ? "Share-Link kopieren" : "Share-Link erzeugen"}
        </DropdownMenuItem>
        {activeLink ? (
          <DropdownMenuItem onClick={() => void revokeShareLink()}>
            <Trash2 className="size-4" />
            Share-Link widerrufen
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => mailPrepare()}>
          <Mail className="size-4" />
          Per Mail vorbereiten
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void webShare()}>
          <Copy className="size-4" />
          Teilen…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact ICS link kept for layouts that still want a direct chip. */
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
