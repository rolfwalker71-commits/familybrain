"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDateDe } from "@/lib/finance-brain/format";
import { toSwissDate } from "@/lib/utils/dates";

type ShareLink = {
  id: number;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export type TripExportEventOption = {
  id: number;
  title: string;
  event_type: string;
  start_date: string | null;
  start_time: string | null;
};

type TripExportMenuProps = {
  tripId: number;
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  events: TripExportEventOption[];
  onStatus?: (msg: string) => void;
  onError?: (msg: string) => void;
};

function shareUrlForToken(token: string): string {
  if (typeof window === "undefined") return `/share/t/${token}`;
  return `${window.location.origin}/share/t/${token}`;
}

function eventSubtitle(ev: TripExportEventOption): string {
  const date = formatDateDe(ev.start_date) || "Ohne Datum";
  const time = ev.start_time?.trim()
    ? ` · ${ev.start_time.slice(0, 5)}`
    : "";
  const type = ev.event_type?.trim() ? ` · ${ev.event_type}` : "";
  return `${date}${time}${type}`;
}

export function TripExportMenu({
  tripId,
  title,
  destination,
  startDate,
  endDate,
  events,
  onStatus,
  onError,
}: TripExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [icsOpen, setIcsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeLink = links.find((l) => !l.revoked_at) || null;
  const exportableEvents = useMemo(
    () => events.filter((e) => Boolean(e.start_date?.trim())),
    [events]
  );

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

  function openIcsPicker() {
    setOpen(false);
    setSelectedIds(exportableEvents.map((e) => e.id));
    setIcsOpen(true);
  }

  function downloadSelectedIcs() {
    if (selectedIds.length === 0) {
      onError?.("Bitte mindestens einen Termin wählen.");
      return;
    }
    const allSelected =
      selectedIds.length === exportableEvents.length &&
      exportableEvents.every((e) => selectedIds.includes(e.id));
    const href = allSelected
      ? `/api/trips/${tripId}/ics`
      : `/api/trips/${tripId}/ics?eventIds=${selectedIds.join(",")}`;
    setIcsOpen(false);
    window.location.href = href;
    onStatus?.(
      allSelected
        ? "Kalender-Export (alle Termine) gestartet."
        : `Kalender-Export (${selectedIds.length} Termine) gestartet.`
    );
  }

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
      "Bitte PDF oder HTML als Anhang manuell beifügen (Download in TravelBuddy).",
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
    <>
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
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className={cn("h-auto w-full justify-start font-normal", itemClass)}
              onClick={() => {
                setOpen(false);
                window.open(`/trips/${tripId}/print?autoprint=1`, "_blank");
              }}
            >
              <Printer className="size-4" />
              Drucken
            </Button>
            <a
              role="menuitem"
              href={`/api/trips/${tripId}/export.html`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <FileText className="size-4" />
              HTML herunterladen
            </a>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className={cn("h-auto w-full justify-start font-normal", itemClass)}
              disabled={exportableEvents.length === 0}
              onClick={() => openIcsPicker()}
            >
              <CalendarPlus className="size-4" />
              Termine in Kalender…
            </Button>
            <div className="my-1 h-px bg-border" />
            <p className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Teilen
            </p>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className={cn("h-auto w-full justify-start font-normal", itemClass)}
              onClick={() => void copyShareLink()}
            >
              <Link2 className="size-4" />
              {activeLink ? "Share-Link kopieren" : "Share-Link erzeugen"}
            </Button>
            {activeLink ? (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                className={cn("h-auto w-full justify-start font-normal", itemClass)}
                onClick={() => void revokeShareLink()}
              >
                <Trash2 className="size-4" />
                Share-Link widerrufen
              </Button>
            ) : null}
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className={cn("h-auto w-full justify-start font-normal", itemClass)}
              onClick={() => {
                setOpen(false);
                mailPrepare();
              }}
            >
              <Mail className="size-4" />
              Per Mail vorbereiten
            </Button>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className={cn("h-auto w-full justify-start font-normal", itemClass)}
              onClick={() => void webShare()}
            >
              <Copy className="size-4" />
              Teilen…
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={icsOpen} onOpenChange={setIcsOpen}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle>Termine für Kalender wählen</DialogTitle>
            <DialogDescription>
              Einen, mehrere oder alle datierten Aktivitäten als ICS
              exportieren.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 pb-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                setSelectedIds(exportableEvents.map((e) => e.id))
              }
            >
              Alle
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setSelectedIds([])}
            >
              Keine
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {selectedIds.length} / {exportableEvents.length}
            </span>
          </div>
          <div className="max-h-[min(50dvh,22rem)] space-y-1.5 overflow-y-auto py-1">
            {exportableEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine datierten Termine vorhanden.
              </p>
            ) : (
              exportableEvents.map((ev) => {
                const checked = selectedIds.includes(ev.id);
                return (
                  <label
                    key={ev.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-sm hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      onChange={() => {
                        setSelectedIds((prev) =>
                          checked
                            ? prev.filter((id) => id !== ev.id)
                            : [...prev, ev.id]
                        );
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">
                        {ev.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {eventSubtitle(ev)}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIcsOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => downloadSelectedIcs()}
              className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
            >
              ICS herunterladen ({selectedIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
