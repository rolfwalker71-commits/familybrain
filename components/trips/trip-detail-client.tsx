"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BedDouble,
  Bus,
  Car,
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  ImagePlus,
  Info,
  MapPin,
  Maximize2,
  Pencil,
  Plane,
  Plus,
  Replace,
  Ship,
  Sparkles,
  Ticket,
  TrainFront,
  Trash2,
  X,
  FilePlus2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/layout/page-primitives";
import {
  IconCircle,
  pageVisuals,
  toneSurface,
  type IconTone,
} from "@/components/layout/icon-circle";
import { CalendarDateBadge } from "@/components/layout/calendar-date-badge";
import { DocumentPdfThumb } from "@/components/documents/document-pdf-preview";
import { TripMap } from "@/components/trips/trip-map";
import { TripExportMenu } from "@/components/trips/trip-export-menu";
import { TripFinanceLedgerCard } from "@/components/finance-brain/trip-finance-ledger-card";
import { BelegNotesBlock } from "@/components/trips/beleg-notes-block";
import { LinkDocumentsToEventDialog } from "@/components/trips/link-documents-to-event-dialog";
import {
  toDateInputValue,
  toSwissDate,
  toTimeInputValue,
} from "@/lib/utils/dates";
import {
  CABIN_CLASSES,
  TRIP_EVENT_TYPES,
  TRIP_STATUSES,
  coerceTripEventType,
} from "@/lib/trips/constants";
import { buildEventImagePrompt } from "@/lib/trips/event-image-prompt";

type Trip = {
  id: number;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  summary: string | null;
  notes: string | null;
  cover_url: string | null;
  cover_prompt: string | null;
};

type TripEvent = {
  id: number;
  event_type: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  provider: string | null;
  booking_reference: string | null;
  notes: string | null;
  flight_number: string | null;
  cabin_class: string | null;
  airline: string | null;
  aircraft_reg: string | null;
  aircraft_type: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  duration_minutes: number | null;
  aircraft_image_url: string | null;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  departure_gate: string | null;
  arrival_gate: string | null;
  check_in_desk: string | null;
  baggage_belt: string | null;
  departure_lat: number | null;
  departure_lon: number | null;
  arrival_lat: number | null;
  arrival_lon: number | null;
  origin_place: string | null;
  destination_place: string | null;
  place_name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  map_image_url: string | null;
  osm_id: string | null;
  enrichment_json?: string | null;
  enriched_at?: string | null;
  document_notes_md?: string | null;
  show_document_notes?: number | boolean | null;
  document_notes_enriched_at?: string | null;
  ai_image_url?: string | null;
  ai_image_prompt?: string | null;
  documents?: Array<{
    id: number;
    paperless_id: number;
    title: string | null;
    removable?: boolean;
  }>;
};

type PlaceCandidate = {
  osmId: string;
  name: string;
  displayName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lon: number;
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  active: "Unterwegs",
  done: "Abgeschlossen",
  cancelled: "Abgesagt",
};

const EVENT_VISUALS: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  Flug: { icon: Plane, tone: "sky" },
  Zugreisen: { icon: TrainFront, tone: "slate" },
  Bahn: { icon: TrainFront, tone: "slate" },
  Mietauto: { icon: Car, tone: "teal" },
  Mietwagen: { icon: Car, tone: "teal" },
  Transfer: { icon: Bus, tone: "slate" },
  Hotel: { icon: BedDouble, tone: "amber" },
  Unterkunft: { icon: BedDouble, tone: "orange" },
  Kreuzfahrt: { icon: Ship, tone: "indigo" },
  Ausflug: { icon: MapPin, tone: "green" },
  Aktivität: { icon: MapPin, tone: "green" },
  Sonstiges: { icon: Ticket, tone: "slate" },
};

function eventVisual(type: string) {
  return EVENT_VISUALS[type] || EVENT_VISUALS.Ausflug;
}

function normText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function textsOverlap(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function isDualPlaceType(type: string): boolean {
  return (
    type === "Transfer" ||
    type === "Zugreisen" ||
    type === "Mietauto" ||
    type === "Mietwagen"
  );
}

function dualPlaceLabels(type: string): { origin: string; destination: string } {
  if (type === "Mietauto" || type === "Mietwagen") {
    return { origin: "Abholung", destination: "Rückgabe" };
  }
  return { origin: "Von", destination: "Nach" };
}

function parseFlightEnrichmentNotice(
  enrichmentJson: string | null | undefined
): string | null {
  if (!enrichmentJson?.trim()) return null;
  try {
    const parsed = JSON.parse(enrichmentJson) as {
      status?: string;
      notice?: string;
      message?: string;
    };
    if (parsed.status === "route_only") {
      return "Flugdaten sind noch nicht verfügbar.";
    }
  } catch {
    /* legacy flight payload */
  }
  return null;
}

function parseEventIsoDate(raw: string | null | undefined): string | null {
  const iso = toDateInputValue(raw);
  return iso || null;
}

function EventDateHeader({
  event,
  reserveEndSlot = false,
}: {
  event: TripEvent;
  /** Keep title columns aligned when some events only have a start date. */
  reserveEndSlot?: boolean;
}) {
  const startIso = parseEventIsoDate(event.start_date);
  if (!startIso) return null;
  const endIso = parseEventIsoDate(event.end_date);
  const showEnd = Boolean(endIso && endIso !== startIso && endIso >= startIso);
  const startTime = toTimeInputValue(event.start_time) || null;
  const endTime = toTimeInputValue(event.end_time) || null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2",
        reserveEndSlot && "w-[11.25rem] sm:w-[12.25rem]"
      )}
    >
      <CalendarDateBadge isoDate={startIso} time={startTime} />
      {showEnd && endIso ? (
        <>
          <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
            bis
          </span>
          <CalendarDateBadge isoDate={endIso} time={endTime} />
        </>
      ) : reserveEndSlot ? (
        <>
          <span
            className="invisible w-5 shrink-0 text-center text-xs font-bold"
            aria-hidden
          >
            bis
          </span>
          <div
            className="invisible h-0 w-[4.5rem] shrink-0 sm:w-[4.85rem]"
            aria-hidden
          />
        </>
      ) : null}
    </div>
  );
}

function formatEventMetaLine(event: TripEvent): string | null {
  const type = coerceTripEventType(event.event_type);
  const transferRoute = isDualPlaceType(type)
    ? event.origin_place && event.destination_place
      ? `${event.origin_place} → ${event.destination_place}`
      : event.origin_place ||
        event.destination_place ||
        (event.location && !textsOverlap(event.location, event.title)
          ? event.location
          : null)
    : null;
  const parts = [
    event.flight_number && (type === "Flug" || type === "Zugreisen")
      ? event.flight_number
      : null,
    transferRoute,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function formatCompactDetailLine(event: TripEvent): string | null {
  const type = coerceTripEventType(event.event_type);
  const startT = toTimeInputValue(event.start_time);
  const endT = toTimeInputValue(event.end_time);
  const time =
    startT || endT ? [startT, endT].filter(Boolean).join("–") : null;
  const route =
    event.origin_place || event.destination_place
      ? [event.origin_place, event.destination_place].filter(Boolean).join(" → ")
      : event.departure_airport || event.arrival_airport
        ? [event.departure_airport, event.arrival_airport]
            .filter(Boolean)
            .join(" → ")
        : null;
  const place =
    event.place_name ||
    (route
      ? null
      : event.location && !textsOverlap(event.location, event.title)
        ? event.location
        : null);
  const parts = [
    type,
    event.airline,
    event.flight_number,
    route || place,
    event.provider,
    event.booking_reference,
    time,
  ].filter((p): p is string => Boolean(p && String(p).trim()));
  return parts.length ? parts.join(" | ") : null;
}

const VIEW_MODE_STORAGE_KEY = "travelbrain.tripViewMode";

type TripViewMode = "cards" | "compact";

function readViewMode(): TripViewMode {
  if (typeof window === "undefined") return "cards";
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "compact"
      ? "compact"
      : "cards";
  } catch {
    return "cards";
  }
}

function splitTransferPlaces(event: TripEvent): {
  origin: string;
  destination: string;
} {
  if (event.origin_place || event.destination_place) {
    return {
      origin: event.origin_place || "",
      destination: event.destination_place || "",
    };
  }
  const loc = (event.location || "").trim();
  const parts = loc.split(/\s*(?:→|->|–)\s*/);
  if (parts.length >= 2) {
    return {
      origin: parts[0]?.trim() || "",
      destination: parts.slice(1).join(" → ").trim(),
    };
  }
  return { origin: loc, destination: "" };
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 text-foreground">{value}</div>
    </div>
  );
}

function createEmptyEventForm() {
  return {
    eventType: "Ausflug",
    title: "",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    location: "",
    originPlace: "",
    destinationPlace: "",
    address: "",
    provider: "",
    bookingReference: "",
    notes: "",
    flightNumber: "",
    cabinClass: "",
    departureAirport: "",
    arrivalAirport: "",
    departureTerminal: "",
    arrivalTerminal: "",
    departureGate: "",
    arrivalGate: "",
    checkInDesk: "",
    baggageBelt: "",
    showDocumentNotes: true,
  };
}

function eventToForm(event: TripEvent) {
  const startDate = toDateInputValue(event.start_date);
  let endDate = toDateInputValue(event.end_date);
  // Drop nonsense ranges (often caused by ISO timestamps / accidental defaults).
  if (startDate && endDate && endDate < startDate) {
    endDate = "";
  }
  // Empty date inputs show "today" as a fake placeholder in Safari — always
  // surface a real stored date (end, otherwise start) so the field is correct.
  if (!endDate) {
    endDate = startDate;
  }
  const transfer = splitTransferPlaces(event);
  return {
    eventType: coerceTripEventType(event.event_type),
    title: event.title,
    startDate,
    endDate,
    startTime: toTimeInputValue(event.start_time),
    endTime: toTimeInputValue(event.end_time),
    location: event.location || "",
    originPlace: transfer.origin,
    destinationPlace: transfer.destination,
    address: event.address || "",
    provider: event.provider || "",
    bookingReference: event.booking_reference || "",
    notes: event.notes || "",
    flightNumber: event.flight_number || "",
    cabinClass: event.cabin_class || "",
    departureAirport: event.departure_airport || "",
    arrivalAirport: event.arrival_airport || "",
    departureTerminal: event.departure_terminal || "",
    arrivalTerminal: event.arrival_terminal || "",
    departureGate: event.departure_gate || "",
    arrivalGate: event.arrival_gate || "",
    checkInDesk: event.check_in_desk || "",
    baggageBelt: event.baggage_belt || "",
    showDocumentNotes: event.show_document_notes !== 0 && event.show_document_notes !== false,
  };
}

export function TripDetailClient({
  tripId,
  shareToken,
}: {
  tripId: number;
  /** Public share view: read-only timeline matching Ansicht mode. */
  shareToken?: string;
}) {
  const readOnly = Boolean(shareToken);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [viewMode, setViewMode] = useState<TripViewMode>("cards");
  const [aiBatch, setAiBatch] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const aiBatchAbortRef = useRef(false);
  const [meta, setMeta] = useState({
    title: "",
    destination: "",
    summary: "",
    notes: "",
    status: "planned",
    startDate: "",
    endDate: "",
  });
  const [eventForm, setEventForm] = useState(createEmptyEventForm);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventSheetOpen, setEventSheetOpen] = useState(false);
  const [linkDocsEventId, setLinkDocsEventId] = useState<number | null>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [placeCandidates, setPlaceCandidates] = useState<
    Record<number, PlaceCandidate[]>
  >({});
  const [placeQueries, setPlaceQueries] = useState<Record<number, string>>(
    {}
  );
  const [placeEnrichTarget, setPlaceEnrichTarget] = useState<
    "place" | "origin" | "destination"
  >("place");
  const [dragEventId, setDragEventId] = useState<number | null>(null);
  const [dragOverEventId, setDragOverEventId] = useState<number | null>(null);
  const [aiImageEventId, setAiImageEventId] = useState<number | null>(null);
  const [aiImagePrompt, setAiImagePrompt] = useState("");
  const [aiImagePromptDirty, setAiImagePromptDirty] = useState(false);
  const [aiImagePromptLoading, setAiImagePromptLoading] = useState(false);
  const [aiReplaceEventId, setAiReplaceEventId] = useState<number | null>(null);
  const aiReplaceInputRef = useRef<HTMLInputElement | null>(null);
  const [aiImageBusy, setAiImageBusy] = useState(false);
  const [aiZoom, setAiZoom] = useState<{
    url: string;
    title: string;
    eventId: number;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      shareToken
        ? `/api/share/t/${encodeURIComponent(shareToken)}`
        : `/api/trips/${tripId}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
    setTrip(data.trip);
    setEvents(data.events || []);
    setMeta({
      title: data.trip.title || "",
      destination: data.trip.destination || "",
      summary: data.trip.summary || "",
      notes: data.trip.notes || "",
      status: data.trip.status || "planned",
      startDate: toDateInputValue(data.trip.start_date),
      endDate: toDateInputValue(data.trip.end_date),
    });
  }, [tripId, shareToken]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, [load]);

  useEffect(() => {
    if (readOnly) setEditMode(false);
  }, [readOnly]);

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  function changeViewMode(mode: TripViewMode) {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  async function saveMeta() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meta.title,
          destination: meta.destination || null,
          summary: meta.summary || null,
          notes: meta.notes || null,
          status: meta.status,
          startDate: meta.startDate || null,
          endDate: meta.endDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setStatus("Reise gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEvent(options?: { keepEditing?: boolean }) {
    if (!eventForm.title.trim()) return null;
    setBusy(true);
    setError(null);
    try {
      const dep = eventForm.departureAirport.trim().toUpperCase() || null;
      const arr = eventForm.arrivalAirport.trim().toUpperCase() || null;
      const origin = eventForm.originPlace.trim() || null;
      const destination = eventForm.destinationPlace.trim() || null;
      const startDate = toDateInputValue(eventForm.startDate) || null;
      let endDate = toDateInputValue(eventForm.endDate) || null;
      if (startDate && endDate && endDate < startDate) {
        endDate = null;
      }
      const isDual = isDualPlaceType(eventForm.eventType);
      const transferLocation =
        origin && destination
          ? `${origin} → ${destination}`
          : origin || destination || null;
      const isFlight = eventForm.eventType === "Flug";
      const isTrain = eventForm.eventType === "Zugreisen";
      const payload = {
        eventType: eventForm.eventType,
        title: eventForm.title.trim(),
        startDate,
        endDate,
        startTime: toTimeInputValue(eventForm.startTime) || null,
        endTime: toTimeInputValue(eventForm.endTime) || null,
        location: isDual
          ? transferLocation
          : eventForm.location ||
            (isFlight && dep && arr
              ? `${dep} → ${arr}`
              : isFlight
                ? dep || arr || null
                : null),
        address: eventForm.address || null,
        provider: eventForm.provider || null,
        bookingReference: eventForm.bookingReference || null,
        notes: eventForm.notes || null,
        showDocumentNotes: eventForm.showDocumentNotes,
        flightNumber:
          isFlight || isTrain ? eventForm.flightNumber || null : null,
        cabinClass: isFlight ? eventForm.cabinClass || null : null,
        departureAirport: isFlight ? dep : null,
        arrivalAirport: isFlight ? arr : null,
        departureTerminal: isFlight
          ? eventForm.departureTerminal || null
          : null,
        arrivalTerminal: isFlight ? eventForm.arrivalTerminal || null : null,
        departureGate: isFlight ? eventForm.departureGate || null : null,
        arrivalGate: isFlight ? eventForm.arrivalGate || null : null,
        checkInDesk: isFlight ? eventForm.checkInDesk || null : null,
        baggageBelt: isFlight ? eventForm.baggageBelt || null : null,
        originPlace: isDual ? origin : null,
        destinationPlace: isDual ? destination : null,
        ...(isDual
          ? {
              ...(origin ? {} : { departureLat: null, departureLon: null }),
              ...(destination ? {} : { arrivalLat: null, arrivalLon: null }),
            }
          : {}),
      };
      const url =
        editingEventId != null
          ? `/api/trips/${tripId}/events/${editingEventId}`
          : `/api/trips/${tripId}/events`;
      const res = await fetch(url, {
        method: editingEventId != null ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      const savedId =
        (data.event?.id as number | undefined) ?? editingEventId;
      if (!options?.keepEditing) {
        setEventForm(createEmptyEventForm());
        setEditingEventId(null);
        setEventSheetOpen(false);
      }
      setStatus(
        editingEventId != null ? "Ereignis aktualisiert." : "Ereignis hinzugefügt."
      );
      await load();
      return savedId;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function startEditEvent(event: TripEvent) {
    setEditingEventId(event.id);
    setEventForm(eventToForm(event));
    setPlaceCandidates((prev) => ({ ...prev, [event.id]: [] }));
    setPlaceEnrichTarget(
      isDualPlaceType(coerceTripEventType(event.event_type))
        ? "origin"
        : "place"
    );
    setEventSheetOpen(true);
  }

  function openNewEvent() {
    setEditingEventId(null);
    setEventForm(createEmptyEventForm());
    setPlaceEnrichTarget("place");
    setEventSheetOpen(true);
  }

  function closeEventSheet() {
    setEventSheetOpen(false);
    setEditingEventId(null);
    setEventForm(createEmptyEventForm());
  }

  async function removeEvent(eventId: number) {
    if (!window.confirm("Ereignis wirklich löschen?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/events/${eventId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      if (editingEventId === eventId) {
        setEditingEventId(null);
        setEventForm(createEmptyEventForm());
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTrip() {
    if (!trip) return;
    if (!window.confirm(`Reise «${trip.title}» wirklich löschen?`)) return;
    const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Löschen fehlgeschlagen");
      return;
    }
    window.location.href = "/trips";
  }

  async function uploadCover(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/trips/${tripId}/cover`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");
      await load();
      setStatus("Titelbild hochgeladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function downloadCover() {
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/cover?download=1`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download fehlgeschlagen");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || "titelbild.png";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function downloadEventAiImage(eventId: number) {
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/ai-image?download=1`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download fehlgeschlagen");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || `event-${eventId}.png`;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function downloadAllAiImages() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/ai-images/zip`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download fehlgeschlagen");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || "ki-bilder.zip";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
      setStatus("KI-Bilder heruntergeladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function pickReplaceAiImage(eventId: number) {
    setAiReplaceEventId(eventId);
    queueMicrotask(() => aiReplaceInputRef.current?.click());
  }

  async function replaceAiImage(eventId: number, file: File) {
    setAiImageBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/ai-image`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ersetzen fehlgeschlagen");
      await load();
      setStatus("KI-Bild ersetzt.");
      if (aiImageEventId === eventId) setAiImageEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiImageBusy(false);
      setAiReplaceEventId(null);
      if (aiReplaceInputRef.current) aiReplaceInputRef.current.value = "";
    }
  }

  async function generateCover() {
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate: true, prompt: coverPrompt || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generierung fehlgeschlagen");
      await load();
      setStatus("Titelbild erzeugt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function enrichFlight(eventId: number) {
    setError(null);
    try {
      // Persist form values first so lookup uses the dates/flight number on screen.
      if (editingEventId === eventId) {
        const saved = await saveEvent({ keepEditing: true });
        if (saved == null) return;
      }
      setBusy(true);
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-flight`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anreicherung fehlgeschlagen");
      await load();
      if (data.event && editingEventId === eventId) {
        setEventForm(eventToForm(data.event as TripEvent));
      }
      setStatus(
        typeof data.warning === "string" && data.warning.trim()
          ? data.warning
          : "Flugdaten angereichert."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function searchPlace(eventId: number) {
    setError(null);
    try {
      if (editingEventId === eventId) {
        const saved = await saveEvent({ keepEditing: true });
        if (saved == null) return;
      }
      setBusy(true);
      const event = events.find((e) => e.id === eventId);
      const isDual =
        isDualPlaceType(
          editingEventId === eventId
            ? eventForm.eventType
            : coerceTripEventType(event?.event_type || "")
        );
      const target = isDual ? placeEnrichTarget : "place";
      const transferQuery =
        target === "destination"
          ? editingEventId === eventId
            ? eventForm.destinationPlace
            : event?.destination_place
          : editingEventId === eventId
            ? eventForm.originPlace
            : event?.origin_place;
      const defaultQuery = (
        isDual
          ? [transferQuery, trip?.destination]
          : [
              editingEventId === eventId ? eventForm.title : event?.title,
              editingEventId === eventId ? eventForm.address : event?.address,
              editingEventId === eventId ? eventForm.location : event?.location,
              trip?.destination,
            ]
      )
        .filter(Boolean)
        .join(", ");
      const query = (placeQueries[eventId] ?? defaultQuery).trim();
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: query || undefined,
            target,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suche fehlgeschlagen");
      const candidates = (data.candidates || []) as PlaceCandidate[];
      setPlaceCandidates((prev) => ({
        ...prev,
        [eventId]: candidates,
      }));
      if (candidates.length === 0) {
        setStatus("Keine OSM-Treffer gefunden.");
      } else {
        setStatus(`${candidates.length} OSM-Treffer — bitte auswählen.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyPlace(eventId: number, candidate: PlaceCandidate) {
    setBusy(true);
    setError(null);
    try {
      const event = events.find((e) => e.id === eventId);
      const isDual =
        isDualPlaceType(
          editingEventId === eventId
            ? eventForm.eventType
            : coerceTripEventType(event?.event_type || "")
        );
      const target = isDual ? placeEnrichTarget : "place";
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate, target }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
      setPlaceCandidates((prev) => ({ ...prev, [eventId]: [] }));
      await load();
      if (data.event && editingEventId === eventId) {
        setEventForm(eventToForm(data.event as TripEvent));
      }
      setStatus(
        target === "origin"
          ? "Abfahrtsort angereichert."
          : target === "destination"
            ? "Zielort angereichert."
            : "Ort angereichert."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function exitEditMode() {
    setEditMode(false);
    closeEventSheet();
    setDragEventId(null);
    setDragOverEventId(null);
  }

  async function persistEventOrder(nextEvents: TripEvent[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/events/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedEventIds: nextEvents.map((e) => e.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reihenfolge speichern fehlgeschlagen");
      if (Array.isArray(data.events)) {
        setEvents(data.events);
      }
      setStatus("Reihenfolge gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setBusy(false);
    }
  }

  function moveEvent(eventId: number, delta: -1 | 1) {
    const fromIndex = events.findIndex((x) => x.id === eventId);
    if (fromIndex < 0) return;
    const toIndex = fromIndex + delta;
    if (toIndex < 0 || toIndex >= events.length) return;
    const next = [...events];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setEvents(next);
    void persistEventOrder(next);
  }

  async function unlinkEventDocument(eventId: number, documentId: number) {
    if (!window.confirm("Verknüpfung dieses Belegs entfernen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/documents?documentId=${documentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Entfernen fehlgeschlagen");
      await load();
      setStatus("Beleg-Verknüpfung entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function enrichEventNotes(eventId: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-notes`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anreicherung fehlgeschlagen");
      await load();
      if (data.event && editingEventId === eventId) {
        setEventForm(eventToForm(data.event as TripEvent));
      }
      setStatus(
        data.empty
          ? "Keine zusätzlichen Beleg-Infos gefunden."
          : "Beleg-Details angereichert."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function enrichAllEventNotes() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/enrich-notes`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anreicherung fehlgeschlagen");
      await load();
      setStatus(
        `Beleg-Details: ${data.updated || 0} mit Inhalt, ${data.empty || 0} ohne.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleShowDocumentNotes(
    eventId: number,
    show: boolean
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showDocumentNotes: show }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      await load();
      if (data.event && editingEventId === eventId) {
        setEventForm(eventToForm(data.event as TripEvent));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function openAiImageDialog(event: TripEvent) {
    setAiImageEventId(event.id);
    setAiImagePromptDirty(false);
    setAiImagePromptLoading(true);
    setAiImagePrompt(
      buildEventImagePrompt(event) // temporary until settings template loads
    );
    void fetch(`/api/trips/${tripId}/events/${event.id}/ai-image`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) return;
        if (typeof data.prompt === "string" && data.prompt.trim()) {
          setAiImagePrompt(data.prompt);
          setAiImagePromptDirty(false);
        }
      })
      .catch(() => {
        /* keep client fallback */
      })
      .finally(() => {
        setAiImagePromptLoading(false);
      });
  }

  async function generateAiImage() {
    if (aiImageEventId == null) return;
    setAiImageBusy(true);
    setError(null);
    try {
      const body =
        aiImagePromptDirty && aiImagePrompt.trim()
          ? { prompt: aiImagePrompt.trim() }
          : { useSettings: true };
      const res = await fetch(
        `/api/trips/${tripId}/events/${aiImageEventId}/ai-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bildgenerierung fehlgeschlagen");
      await load();
      setStatus("KI-Bild erstellt (Illustration, low quality).");
      setAiImageEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiImageBusy(false);
    }
  }

  async function deleteAiImage(eventId: number) {
    setAiImageBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/ai-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      await load();
      setStatus("KI-Bild entfernt.");
      if (aiImageEventId === eventId) setAiImageEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiImageBusy(false);
    }
  }

  async function runAiImageBatch(
    targets: TripEvent[],
    emptyMessage: string
  ) {
    if (targets.length === 0) {
      setStatus(emptyMessage);
      return;
    }
    if (aiBatch) return;
    aiBatchAbortRef.current = false;
    setError(null);
    setAiBatch({ current: 0, total: targets.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < targets.length; i++) {
      if (aiBatchAbortRef.current) break;
      const event = targets[i];
      setAiBatch({ current: i + 1, total: targets.length });
      try {
        const res = await fetch(
          `/api/trips/${tripId}/events/${event.id}/ai-image`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ useSettings: true }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Bildgenerierung fehlgeschlagen");
        if (data.event) {
          setEvents((prev) =>
            prev.map((e) =>
              e.id === data.event.id ? { ...e, ...data.event } : e
            )
          );
        }
        ok += 1;
      } catch (err) {
        fail += 1;
        console.error(err);
      }
    }
    setAiBatch(null);
    setStatus(
      aiBatchAbortRef.current
        ? `KI-Bilder abgebrochen (${ok} erzeugt${fail ? `, ${fail} Fehler` : ""}).`
        : `KI-Bilder: ${ok} erzeugt${fail ? `, ${fail} fehlgeschlagen` : ""}.`
    );
  }

  async function batchGenerateMissingAiImages() {
    await runAiImageBatch(
      events.filter((e) => !e.ai_image_url),
      "Alle Aktivitäten haben bereits ein KI-Bild."
    );
  }

  async function batchRegenerateAllAiImages() {
    if (events.length === 0) {
      setStatus("Keine Aktivitäten vorhanden.");
      return;
    }
    const confirmed = window.confirm(
      `Alle ${events.length} KI-Bilder neu erzeugen?\n\nBestehende Bilder werden überschrieben. Der aktuelle Prompt aus den Einstellungen wird verwendet.`
    );
    if (!confirmed) return;
    await runAiImageBatch(events, "Keine Aktivitäten vorhanden.");
  }

  if (!trip) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="TravelBrain"
          description="Reise wird geladen…"
          icon={pageVisuals.travel.icon}
          tone={pageVisuals.travel.tone}
        />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/trips"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
          >
            <ArrowLeft className="size-4" />
            Alle Reisen
          </Link>
        </div>
      ) : null}

      <div
        className="relative h-48 overflow-hidden rounded-xl bg-gradient-to-br from-teal-100 to-sky-100 bg-cover bg-center sm:h-64"
        style={
          trip.cover_url
            ? { backgroundImage: `url(${trip.cover_url})` }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{trip.title}</h1>
              <p className="mt-1 text-sm text-white/85">
                {[
                  trip.destination,
                  trip.start_date
                    ? `${toSwissDate(trip.start_date)}${
                        trip.end_date ? ` – ${toSwissDate(trip.end_date)}` : ""
                      }`
                    : null,
                  STATUS_LABEL[trip.status],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Badge className="bg-white/90 text-foreground hover:bg-white">
              {events.length} Ereignisse
            </Badge>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {status}
        </div>
      ) : null}

      {!readOnly ? <TripFinanceLedgerCard tripId={tripId} /> : null}

      {!readOnly ? (
      <div className="flex flex-wrap gap-2">
        <TripExportMenu
          tripId={tripId}
          title={trip.title}
          destination={trip.destination}
          startDate={trip.start_date}
          endDate={trip.end_date}
          onStatus={setStatus}
          onError={setError}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={
            busy ||
            aiImageBusy ||
            (!trip.cover_url && !events.some((e) => e.ai_image_url))
          }
          onClick={() => void downloadAllAiImages()}
          className="gap-1.5"
        >
          <Download className="size-4" />
          KI-Bilder laden
        </Button>
        {editMode ? (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={() => openNewEvent()}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Neuen Eintrag erstellen
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void enrichAllEventNotes()}
            >
              Belege anreichern
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || aiBatch != null || aiImageBusy}
              onClick={() => void batchGenerateMissingAiImages()}
              className="gap-1.5"
            >
              <ImagePlus className="size-4" />
              {aiBatch
                ? `KI-Bilder ${aiBatch.current}/${aiBatch.total}…`
                : "KI-Bilder erzeugen"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                aiBatch != null ||
                aiImageBusy ||
                events.length === 0
              }
              onClick={() => void batchRegenerateAllAiImages()}
            >
              Alle KI-Bilder neu
            </Button>
            {aiBatch ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  aiBatchAbortRef.current = true;
                }}
              >
                Abbrechen
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => exitEditMode()}>
              Ansicht
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void deleteTrip()}>
              <Trash2 className="mr-1.5 size-4" />
              Reise löschen
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditMode(true)}
          >
            <Pencil className="mr-1.5 size-4" />
            Reise bearbeiten
          </Button>
        )}
      </div>
      ) : null}

      {editMode ? (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reise bearbeiten</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Titel</Label>
              <Input
                value={meta.title}
                onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ziel</Label>
              <Input
                value={meta.destination}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, destination: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={meta.status}
                onValueChange={(v) => {
                  if (v == null) return;
                  setMeta((m) => ({ ...m, status: v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Von</Label>
              <Input
                type="date"
                value={meta.startDate}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, startDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bis</Label>
              <Input
                type="date"
                value={meta.endDate}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, endDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Kurzbeschreibung</Label>
              <Input
                value={meta.summary}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, summary: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notizen</Label>
              <Textarea
                value={meta.notes}
                onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button disabled={busy} onClick={() => void saveMeta()}>
                Speichern
              </Button>
            </div>
          </CardContent>
        </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Titelbild</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="coverFile">Hochladen</Label>
            <Input
              id="coverFile"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCover(file);
              }}
            />
          </div>
          <div className="min-w-0 w-full flex-1 space-y-1.5 sm:min-w-[16rem]">
            <Label>AI-Prompt (optional)</Label>
            <Input
              value={coverPrompt}
              onChange={(e) => setCoverPrompt(e.target.value)}
              placeholder="z. B. Karibik bei Sonnenuntergang, Kreuzfahrtschiff"
            />
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void generateCover()}
            className="gap-1.5"
          >
            <Sparkles className="size-4" />
            Mit AI erzeugen
          </Button>
          <Button
            variant="outline"
            disabled={busy || !trip.cover_url}
            onClick={() => void downloadCover()}
            className="gap-1.5"
          >
            <Download className="size-4" />
            Herunterladen
          </Button>
        </CardContent>
      </Card>

      </>
      ) : null}

      <Sheet
        open={eventSheetOpen}
        onOpenChange={(open) => {
          if (open) setEventSheetOpen(true);
          else closeEventSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex h-dvh max-h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 border-b border-border/70 px-4 pt-4">
            <SheetTitle>
              {editingEventId != null
                ? "Eintrag bearbeiten"
                : "Neuen Eintrag erstellen"}
            </SheetTitle>
            <SheetDescription>
              Typ, Zeiten und Details festlegen — Belege sind optional und können
              später verknüpft werden.
            </SheetDescription>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select
                value={eventForm.eventType}
                onValueChange={(v) => {
                  if (v == null) return;
                  setEventForm((f) => ({ ...f, eventType: v }));
                  setPlaceEnrichTarget(
                    isDualPlaceType(v) ? "origin" : "place"
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Titel</Label>
              <Input
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Datum von</Label>
              <Input
                key={`start-${editingEventId ?? "new"}`}
                type="date"
                value={eventForm.startDate}
                onChange={(e) => {
                  const startDate = e.target.value;
                  setEventForm((f) => ({
                    ...f,
                    startDate,
                    // Keep end in sync when it was empty or before the new start
                    // (avoids Safari showing "today" in an empty bis field).
                    endDate:
                      !f.endDate || f.endDate < startDate
                        ? startDate
                        : f.endDate,
                  }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Datum bis</Label>
              <Input
                key={`end-${editingEventId ?? "new"}`}
                type="date"
                value={eventForm.endDate}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Zeit von</Label>
              <Input
                type="time"
                value={eventForm.startTime}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, startTime: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Zeit bis</Label>
              <Input
                type="time"
                value={eventForm.endTime}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, endTime: e.target.value }))
                }
              />
            </div>
            {isDualPlaceType(eventForm.eventType) ? (
              <>
                <div className="space-y-1.5">
                  <Label>
                    {dualPlaceLabels(eventForm.eventType).origin}
                  </Label>
                  <Input
                    value={eventForm.originPlace}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        originPlace: e.target.value,
                      }))
                    }
                    placeholder={
                      dualPlaceLabels(eventForm.eventType).origin
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {dualPlaceLabels(eventForm.eventType).destination}
                  </Label>
                  <Input
                    value={eventForm.destinationPlace}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        destinationPlace: e.target.value,
                      }))
                    }
                    placeholder={
                      dualPlaceLabels(eventForm.eventType).destination
                    }
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>Ort</Label>
                <Input
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, location: e.target.value }))
                  }
                />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Adresse</Label>
              <Input
                value={eventForm.address}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, address: e.target.value }))
                }
                placeholder="Strasse, PLZ Ort"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Anbieter</Label>
              <Input
                value={eventForm.provider}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, provider: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Buchungsnr.</Label>
              <Input
                value={eventForm.bookingReference}
                onChange={(e) =>
                  setEventForm((f) => ({
                    ...f,
                    bookingReference: e.target.value,
                  }))
                }
              />
            </div>
            {eventForm.eventType === "Flug" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Flugnummer</Label>
                  <Input
                    value={eventForm.flightNumber}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        flightNumber: e.target.value,
                      }))
                    }
                    placeholder="z. B. LX80"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Klasse</Label>
                  <Select
                    value={eventForm.cabinClass || "__none__"}
                    onValueChange={(v) =>
                      setEventForm((f) => ({
                        ...f,
                        cabinClass: !v || v === "__none__" ? "" : String(v),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Klasse wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {CABIN_CLASSES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                      {eventForm.cabinClass &&
                      !(CABIN_CLASSES as readonly string[]).includes(
                        eventForm.cabinClass
                      ) ? (
                        <SelectItem value={eventForm.cabinClass}>
                          {eventForm.cabinClass}
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Von (IATA)</Label>
                  <Input
                    value={eventForm.departureAirport}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        departureAirport: e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z]/g, "")
                          .slice(0, 3),
                      }))
                    }
                    placeholder="ZRH"
                    maxLength={3}
                    className="font-mono uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nach (IATA)</Label>
                  <Input
                    value={eventForm.arrivalAirport}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        arrivalAirport: e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z]/g, "")
                          .slice(0, 3),
                      }))
                    }
                    placeholder="BCN"
                    maxLength={3}
                    className="font-mono uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Terminal Abflug</Label>
                  <Input
                    value={eventForm.departureTerminal}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        departureTerminal: e.target.value,
                      }))
                    }
                    placeholder="z. B. 1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gate Abflug</Label>
                  <Input
                    value={eventForm.departureGate}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        departureGate: e.target.value,
                      }))
                    }
                    placeholder="z. B. A12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Terminal Ankunft</Label>
                  <Input
                    value={eventForm.arrivalTerminal}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        arrivalTerminal: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gate Ankunft</Label>
                  <Input
                    value={eventForm.arrivalGate}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        arrivalGate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Check-in</Label>
                  <Input
                    value={eventForm.checkInDesk}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        checkInDesk: e.target.value,
                      }))
                    }
                    placeholder="z. B. 120–150"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gepäckband</Label>
                  <Input
                    value={eventForm.baggageBelt}
                    onChange={(e) =>
                      setEventForm((f) => ({
                        ...f,
                        baggageBelt: e.target.value,
                      }))
                    }
                    placeholder="z. B. 3"
                  />
                </div>
              </>
            ) : eventForm.eventType === "Zugreisen" ? (
              <div className="space-y-1.5">
                <Label>Zugnummer (optional)</Label>
                <Input
                  value={eventForm.flightNumber}
                  onChange={(e) =>
                    setEventForm((f) => ({
                      ...f,
                      flightNumber: e.target.value,
                    }))
                  }
                  placeholder="z. B. IC 732"
                />
              </div>
            ) : null}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notizen (manuell)</Label>
              <Textarea
                className="min-h-28"
                value={eventForm.notes}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Eigene Notizen — unabhängig von Beleg-Details"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={eventForm.showDocumentNotes}
                  onChange={(e) =>
                    setEventForm((f) => ({
                      ...f,
                      showDocumentNotes: e.target.checked,
                    }))
                  }
                />
                Beleg-Infos auf der Karte anzeigen
              </label>
            </div>

            {editingEventId != null ? (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Anreichern
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void enrichEventNotes(editingEventId)}
                >
                  Aus Beleg anreichern
                </Button>
                {eventForm.eventType === "Flug" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !eventForm.flightNumber.trim()}
                    onClick={() => void enrichFlight(editingEventId)}
                    className="gap-1.5"
                  >
                    <Plane className="size-3.5" />
                    Mit Fluginfos anreichern
                  </Button>
                ) : null}
                {eventForm.eventType !== "Flug" ? (
                  <div className="space-y-2">
                    {isDualPlaceType(eventForm.eventType) ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={
                            placeEnrichTarget === "origin"
                              ? "secondary"
                              : "outline"
                          }
                          type="button"
                          onClick={() => setPlaceEnrichTarget("origin")}
                        >
                          {dualPlaceLabels(eventForm.eventType).origin}{" "}
                          anreichern
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            placeEnrichTarget === "destination"
                              ? "secondary"
                              : "outline"
                          }
                          type="button"
                          onClick={() => setPlaceEnrichTarget("destination")}
                        >
                          {dualPlaceLabels(eventForm.eventType).destination}{" "}
                          anreichern
                        </Button>
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label
                          htmlFor={`place-query-edit-${editingEventId}`}
                          className="text-xs"
                        >
                          OSM-Suche
                          {isDualPlaceType(eventForm.eventType)
                            ? placeEnrichTarget === "destination"
                              ? ` (${dualPlaceLabels(eventForm.eventType).destination})`
                              : ` (${dualPlaceLabels(eventForm.eventType).origin})`
                            : ""}
                        </Label>
                        <Input
                          id={`place-query-edit-${editingEventId}`}
                          value={
                            placeQueries[editingEventId] ??
                            (isDualPlaceType(eventForm.eventType)
                              ? [
                                  placeEnrichTarget === "destination"
                                    ? eventForm.destinationPlace
                                    : eventForm.originPlace,
                                  trip?.destination,
                                ]
                                  .filter(Boolean)
                                  .join(", ")
                              : [
                                  eventForm.title,
                                  eventForm.address,
                                  eventForm.location,
                                  trip?.destination,
                                ]
                                  .filter(Boolean)
                                  .join(", "))
                          }
                          onChange={(e) =>
                            setPlaceQueries((prev) => ({
                              ...prev,
                              [editingEventId]: e.target.value,
                            }))
                          }
                          placeholder="Name + Stadt reicht oft (fuzzy Suche)"
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void searchPlace(editingEventId)}
                        className="gap-1.5 shrink-0"
                      >
                        <MapPin className="size-3.5" />
                        Ort suchen
                      </Button>
                    </div>
                  </div>
                ) : null}
                {(placeCandidates[editingEventId] || []).length > 0 ? (
                  <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                    <div className="text-xs font-medium">OSM-Treffer wählen</div>
                    {placeCandidates[editingEventId].map((c) => (
                      <button
                        key={c.osmId}
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                        onClick={() => void applyPlace(editingEventId, c)}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className="text-muted-foreground">
                          {c.displayName}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {editingEventId != null ? (
              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 sm:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Belege
                </div>
                <p className="text-xs text-muted-foreground">
                  Mehrere Paperless-PDFs können verknüpft werden. Neue PDFs zuerst
                  in Paperless importieren.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => setLinkDocsEventId(editingEventId)}
                >
                  <FilePlus2 className="size-3.5" />
                  Belege verknüpfen
                </Button>
              </div>
            ) : null}
          </div>
          <SheetFooter className="mt-auto shrink-0 flex-row gap-2 border-t border-border/70 bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              disabled={busy || !eventForm.title.trim()}
              onClick={() => void saveEvent()}
            >
              {editingEventId != null ? "Speichern" : "Hinzufügen"}
            </Button>
            <Button variant="ghost" onClick={() => closeEventSheet()}>
              Abbrechen
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {linkDocsEventId != null ? (
        <LinkDocumentsToEventDialog
          tripId={tripId}
          eventId={linkDocsEventId}
          open
          onOpenChange={(open) => {
            if (!open) setLinkDocsEventId(null);
          }}
          excludeDocumentIds={
            events
              .find((e) => e.id === linkDocsEventId)
              ?.documents?.map((d) => d.id) || []
          }
          onLinked={(message) => {
            setStatus(message);
            void load();
          }}
          onError={setError}
        />
      ) : null}

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Timeline</h2>
          <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "cards" ? "default" : "ghost"}
              className="h-7 px-2.5"
              onClick={() => changeViewMode("cards")}
            >
              Karten
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "compact" ? "default" : "ghost"}
              className="h-7 px-2.5"
              onClick={() => changeViewMode("compact")}
            >
              Kompakt
            </Button>
          </div>
        </div>
        {editMode ? (
          <p className="text-xs text-muted-foreground">
            Reihenfolge per ▲/▼ oder am Griff ziehen (Desktop).
          </p>
        ) : null}
        {aiBatch ? (
          <p className="text-xs text-muted-foreground">
            KI-Bilder laufen im Hintergrund ({aiBatch.current}/{aiBatch.total}
            )…
          </p>
        ) : null}
        {events.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Noch keine Einträge. Du kannst Aktivitäten ohne Beleg anlegen und
              später Dokumente verknüpfen.
            </p>
            {editMode ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => openNewEvent()}
              >
                <Plus className="size-4" />
                Neuen Eintrag erstellen
              </Button>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col",
              viewMode === "compact" ? "gap-2.5" : "gap-5"
            )}
          >
          {events.map((event) => {
            const visual = eventVisual(event.event_type);
            if (viewMode === "compact") {
              const details = formatCompactDetailLine(event);
              const documents = event.documents || [];
              return (
                <div
                  key={event.id}
                  className={cn(
                    "relative pt-2 pl-3",
                    editMode &&
                      dragOverEventId === event.id &&
                      "opacity-80"
                  )}
                  onDragOver={
                    editMode
                      ? (e) => {
                          e.preventDefault();
                          if (dragEventId != null && dragEventId !== event.id) {
                            setDragOverEventId(event.id);
                          }
                        }
                      : undefined
                  }
                  onDrop={
                    editMode
                      ? (e) => {
                          e.preventDefault();
                          if (dragEventId == null || dragEventId === event.id) {
                            setDragEventId(null);
                            setDragOverEventId(null);
                            return;
                          }
                          const fromId = dragEventId;
                          const toId = event.id;
                          setDragEventId(null);
                          setDragOverEventId(null);
                          const fromIndex = events.findIndex(
                            (x) => x.id === fromId
                          );
                          const toIndex = events.findIndex((x) => x.id === toId);
                          if (fromIndex < 0 || toIndex < 0) return;
                          const next = [...events];
                          const [moved] = next.splice(fromIndex, 1);
                          next.splice(toIndex, 0, moved);
                          setEvents(next);
                          void persistEventOrder(next);
                        }
                      : undefined
                  }
                >
                  <IconCircle
                    icon={visual.icon}
                    tone={visual.tone}
                    size="md"
                    className="absolute left-0 top-1 z-10 border-2 border-foreground/20 shadow-md"
                  />
                  <Card
                    tone={visual.tone}
                    className={cn(
                      "relative gap-0 overflow-visible py-0",
                      editMode &&
                        dragOverEventId === event.id &&
                        "ring-2 ring-teal-400/50"
                    )}
                  >
                    <CardContent className="flex items-center gap-4 p-2.5 pl-9 sm:gap-5 sm:p-3 sm:pl-10">
                      <div className="flex shrink-0 items-center">
                        <EventDateHeader event={event} reserveEndSlot />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          {editMode ? (
                            <button
                              type="button"
                              draggable
                              title="Ziehen zum Sortieren"
                              className="mt-1 hidden cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing sm:inline-flex"
                              onDragStart={(e) => {
                                setDragEventId(event.id);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData(
                                  "text/plain",
                                  String(event.id)
                                );
                              }}
                              onDragEnd={() => {
                                setDragEventId(null);
                                setDragOverEventId(null);
                              }}
                            >
                              <GripVertical className="size-4" />
                            </button>
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="text-base font-black leading-tight tracking-tight sm:text-lg">
                              {event.title}
                            </div>
                            {details ? (
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {details}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!readOnly
                          ? documents.map((doc) => (
                              <DocumentPdfThumb
                                key={doc.id}
                                paperlessId={doc.paperless_id}
                                title={doc.title}
                                href={`/documents/${doc.id}`}
                                size="square"
                                removing={busy}
                                onRemove={
                                  editMode && doc.removable !== false
                                    ? () =>
                                        void unlinkEventDocument(
                                          event.id,
                                          doc.id
                                        )
                                    : undefined
                                }
                              />
                            ))
                          : null}
                        {event.ai_image_url ? (
                          <button
                            type="button"
                            className="relative shrink-0"
                            title="Vergrössern"
                            onClick={() =>
                              setAiZoom({
                                url: event.ai_image_url!,
                                title: event.title,
                                eventId: event.id,
                              })
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={event.ai_image_url}
                              alt=""
                              className="h-14 w-14 rounded-md border border-border/60 object-cover shadow-sm"
                            />
                          </button>
                        ) : null}
                      </div>
                      {!readOnly ? (
                        <div className="flex shrink-0 flex-col gap-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => startEditEvent(event)}
                          >
                            <Pencil className="mr-1 size-3.5" />
                            Ändern
                          </Button>
                          {editMode ? (
                            <>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                title="Belege verknüpfen"
                                disabled={busy}
                                onClick={() => setLinkDocsEventId(event.id)}
                              >
                                <FilePlus2 className="size-3.5" />
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                title="KI-Bild"
                                disabled={
                                  busy || aiImageBusy || aiBatch != null
                                }
                                onClick={() => openAiImageDialog(event)}
                              >
                                <ImagePlus className="size-3.5" />
                              </Button>
                              {event.ai_image_url ? (
                                <>
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    title="Herunterladen"
                                    disabled={aiImageBusy}
                                    onClick={() =>
                                      void downloadEventAiImage(event.id)
                                    }
                                  >
                                    <Download className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    title="Ersetzen"
                                    disabled={aiImageBusy}
                                    onClick={() =>
                                      pickReplaceAiImage(event.id)
                                    }
                                  >
                                    <Replace className="size-3.5" />
                                  </Button>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              );
            }
            return (
              <div
                key={event.id}
                className={cn(
                  "relative pt-3 pl-3",
                  editMode && dragOverEventId === event.id && "opacity-80"
                )}
                onDragOver={
                  editMode
                    ? (e) => {
                        e.preventDefault();
                        if (dragEventId != null && dragEventId !== event.id) {
                          setDragOverEventId(event.id);
                        }
                      }
                    : undefined
                }
                onDrop={
                  editMode
                    ? (e) => {
                        e.preventDefault();
                        if (dragEventId == null || dragEventId === event.id) {
                          setDragEventId(null);
                          setDragOverEventId(null);
                          return;
                        }
                        const fromId = dragEventId;
                        const toId = event.id;
                        setDragEventId(null);
                        setDragOverEventId(null);
                        const fromIndex = events.findIndex((x) => x.id === fromId);
                        const toIndex = events.findIndex((x) => x.id === toId);
                        if (fromIndex < 0 || toIndex < 0) return;
                        const next = [...events];
                        const [moved] = next.splice(fromIndex, 1);
                        next.splice(toIndex, 0, moved);
                        setEvents(next);
                        void persistEventOrder(next);
                      }
                    : undefined
                }
              >
                <IconCircle
                  icon={visual.icon}
                  tone={visual.tone}
                  size="lg"
                  className="absolute left-0 top-0 z-10 border-2 border-foreground/20 shadow-md"
                />
                <Card
                  tone={visual.tone}
                  className={cn(
                    "relative gap-0 overflow-visible py-0",
                    editingEventId === event.id && "ring-2 ring-foreground/15",
                    editMode &&
                      dragOverEventId === event.id &&
                      "ring-2 ring-teal-400/50"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-t-[0.7rem] px-4 py-3 pl-8",
                      toneSurface(visual.tone).title
                    )}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <div aria-hidden className="min-w-0" />
                      <div className="justify-self-center">
                        <EventDateHeader event={event} />
                      </div>
                      <div className="justify-self-end">
                        {event.ai_image_url ? (
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={event.ai_image_url}
                              alt=""
                              className="h-16 w-16 rounded-md border border-border/60 object-cover shadow-sm sm:h-[4.5rem] sm:w-[4.5rem]"
                            />
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="secondary"
                              className="absolute bottom-1 right-1 size-6 border border-border/70 bg-background/90 shadow-sm"
                              title="Vergrössern"
                              onClick={() =>
                                setAiZoom({
                                  url: event.ai_image_url!,
                                  title: event.title,
                                  eventId: event.id,
                                })
                              }
                            >
                              <Maximize2 className="size-3" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <CardContent className="space-y-3 p-4 pl-8">
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2 pr-2">
                        {editMode ? (
                          <div className="mt-0.5 flex shrink-0 flex-col items-center gap-0.5">
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              className="sm:hidden"
                              disabled={busy || events[0]?.id === event.id}
                              onClick={() => moveEvent(event.id, -1)}
                              title="Nach oben"
                            >
                              <ChevronUp className="size-3.5" />
                            </Button>
                            <button
                              type="button"
                              draggable
                              title="Ziehen zum Sortieren"
                              className="hidden cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-background/70 active:cursor-grabbing sm:inline-flex"
                              onDragStart={(e) => {
                                setDragEventId(event.id);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData(
                                  "text/plain",
                                  String(event.id)
                                );
                              }}
                              onDragEnd={() => {
                                setDragEventId(null);
                                setDragOverEventId(null);
                              }}
                            >
                              <GripVertical className="size-4" />
                            </button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              className="sm:hidden"
                              disabled={
                                busy ||
                                events[events.length - 1]?.id === event.id
                              }
                              onClick={() => moveEvent(event.id, 1)}
                              title="Nach unten"
                            >
                              <ChevronDown className="size-3.5" />
                            </Button>
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="text-xl font-black leading-tight tracking-tight sm:text-2xl">
                            {event.title}
                          </div>
                          {(() => {
                            const meta = formatEventMetaLine(event);
                            return meta ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {meta}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
                        <Badge variant="secondary" className="shrink-0">
                          {coerceTripEventType(event.event_type)}
                        </Badge>
                        {!readOnly ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => startEditEvent(event)}
                          >
                            <Pencil className="mr-1 size-3.5" />
                            Ändern
                          </Button>
                        ) : null}
                        {editMode ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="KI-Bild"
                              disabled={busy || aiImageBusy}
                              onClick={() => openAiImageDialog(event)}
                            >
                              <ImagePlus className="size-3.5" />
                            </Button>
                            {event.ai_image_url ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="KI-Bild herunterladen"
                                  disabled={aiImageBusy}
                                  onClick={() =>
                                    void downloadEventAiImage(event.id)
                                  }
                                >
                                  <Download className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="KI-Bild ersetzen"
                                  disabled={aiImageBusy}
                                  onClick={() => pickReplaceAiImage(event.id)}
                                >
                                  <Replace className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="KI-Bild entfernen"
                                  disabled={aiImageBusy}
                                  onClick={() => void deleteAiImage(event.id)}
                                >
                                  <X className="size-3.5 text-muted-foreground" />
                                </Button>
                              </>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Belege verknüpfen"
                              disabled={busy}
                              onClick={() => setLinkDocsEventId(event.id)}
                            >
                              <FilePlus2 className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void removeEvent(event.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {(() => {
                      const type = coerceTripEventType(event.event_type);
                      const dual = isDualPlaceType(type);
                      const dualLabels = dualPlaceLabels(type);
                      const routePlaces = splitTransferPlaces(event);
                      const showPlaceName =
                        Boolean(event.place_name) &&
                        !textsOverlap(event.place_name, event.title);
                      const address =
                        type === "Flug" || dual
                          ? event.address
                          : event.address ||
                            (event.location &&
                            !textsOverlap(event.location, event.title) &&
                            !textsOverlap(event.location, event.place_name)
                              ? event.location
                              : null);
                      const hasFlightDetails =
                        type === "Flug" &&
                        Boolean(
                          event.airline ||
                            event.flight_number ||
                            event.cabin_class ||
                            event.departure_airport ||
                            event.arrival_airport ||
                            event.duration_minutes ||
                            event.aircraft_reg ||
                            event.aircraft_type ||
                            event.departure_terminal ||
                            event.arrival_terminal ||
                            event.departure_gate ||
                            event.arrival_gate ||
                            event.check_in_desk ||
                            event.baggage_belt
                        );
                      const hasDualPlaceDetails = Boolean(
                        dual &&
                          (routePlaces.origin ||
                            routePlaces.destination ||
                            (type === "Zugreisen" && event.flight_number))
                      );
                      const hasPlaceDetails = Boolean(
                        showPlaceName ||
                          address ||
                          event.phone ||
                          event.website
                      );
                      const hasPlaceMap =
                        (event.lat != null && event.lon != null) ||
                        Boolean(event.map_image_url);
                      const hasFlightRouteMap =
                        type === "Flug" &&
                        event.departure_lat != null &&
                        event.departure_lon != null &&
                        event.arrival_lat != null &&
                        event.arrival_lon != null;
                      const hasStraightRouteMap =
                        type !== "Flug" &&
                        event.departure_lat != null &&
                        event.departure_lon != null &&
                        event.arrival_lat != null &&
                        event.arrival_lon != null;
                      const endpointPoint =
                        type !== "Flug" && !hasStraightRouteMap
                          ? event.departure_lat != null &&
                            event.departure_lon != null
                            ? {
                                lat: event.departure_lat,
                                lon: event.departure_lon,
                                label: routePlaces.origin || dualLabels.origin,
                              }
                            : event.arrival_lat != null &&
                                event.arrival_lon != null
                              ? {
                                  lat: event.arrival_lat,
                                  lon: event.arrival_lon,
                                  label:
                                    routePlaces.destination ||
                                    dualLabels.destination,
                                }
                              : null
                          : null;
                      const hasRouteMap =
                        hasFlightRouteMap || hasStraightRouteMap;
                      const hasMap =
                        hasPlaceMap || hasRouteMap || Boolean(endpointPoint);
                      const hasGenericDetails = Boolean(
                        event.provider ||
                          event.booking_reference ||
                          (type !== "Flug" && event.flight_number)
                      );
                      const documents = event.documents || [];
                      const hasDocuments = documents.length > 0;
                      const flightEnrichmentNotice =
                        type === "Flug"
                          ? parseFlightEnrichmentNotice(event.enrichment_json)
                          : null;

                      if (
                        !hasFlightDetails &&
                        !hasDualPlaceDetails &&
                        !hasPlaceDetails &&
                        !hasMap &&
                        !hasGenericDetails &&
                        !hasDocuments &&
                        !event.aircraft_image_url &&
                        !event.ai_image_url &&
                        !event.notes &&
                        !flightEnrichmentNotice &&
                        !(
                          event.document_notes_md?.trim() &&
                          event.show_document_notes !== 0 &&
                          event.show_document_notes !== false
                        )
                      ) {
                        return null;
                      }

                      const documentThumbs =
                        !readOnly && hasDocuments ? (
                        <div className="max-w-full overflow-x-auto pb-1">
                          <div
                            className="grid w-max grid-flow-col justify-start gap-2"
                            style={{ gridAutoColumns: "3.5rem" }}
                          >
                          {documents.map((doc) => (
                            <DocumentPdfThumb
                              key={doc.id}
                              paperlessId={doc.paperless_id}
                              title={doc.title}
                              href={`/documents/${doc.id}`}
                              removing={busy}
                              onRemove={
                                doc.removable !== false
                                  ? () =>
                                      void unlinkEventDocument(event.id, doc.id)
                                  : undefined
                              }
                            />
                          ))}
                          </div>
                        </div>
                      ) : null;

                      return (
                        <div className="space-y-3">
                          {flightEnrichmentNotice ? (
                            <div
                              role="status"
                              className="flex gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
                            >
                              <Info
                                className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
                                aria-hidden
                              />
                              <p className="leading-snug">
                                {flightEnrichmentNotice}
                              </p>
                            </div>
                          ) : null}

                          {(hasFlightDetails ||
                            (hasGenericDetails && type === "Flug")) && (
                            <div
                              className={cn(
                                "space-y-1.5 rounded-md px-3 py-2",
                                toneSurface(visual.tone).soft
                              )}
                            >
                              <DetailRow label="Airline" value={event.airline} />
                              <DetailRow
                                label="Strecke"
                                value={
                                  event.departure_airport ||
                                  event.arrival_airport
                                    ? `${event.departure_airport || "—"} → ${
                                        event.arrival_airport || "—"
                                      }`
                                    : null
                                }
                              />
                              <DetailRow
                                label="Flugnr."
                                value={event.flight_number}
                              />
                              <DetailRow
                                label="Klasse"
                                value={event.cabin_class}
                              />
                              <DetailRow
                                label="Dauer"
                                value={
                                  event.duration_minutes != null
                                    ? `${event.duration_minutes} Min.`
                                    : null
                                }
                              />
                              <DetailRow
                                label="Flugzeug"
                                value={[event.aircraft_type, event.aircraft_reg]
                                  .filter(Boolean)
                                  .join(" · ")}
                              />
                              <DetailRow
                                label="Abflug"
                                value={[
                                  event.departure_terminal
                                    ? `Terminal ${event.departure_terminal}`
                                    : null,
                                  event.departure_gate
                                    ? `Gate ${event.departure_gate}`
                                    : null,
                                  event.check_in_desk
                                    ? `Check-in ${event.check_in_desk}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              />
                              <DetailRow
                                label="Ankunft"
                                value={[
                                  event.arrival_terminal
                                    ? `Terminal ${event.arrival_terminal}`
                                    : null,
                                  event.arrival_gate
                                    ? `Gate ${event.arrival_gate}`
                                    : null,
                                  event.baggage_belt
                                    ? `Gepäck ${event.baggage_belt}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              />
                              <DetailRow
                                label="Buchung"
                                value={event.booking_reference}
                              />
                              <DetailRow
                                label="Anbieter"
                                value={event.provider}
                              />
                            </div>
                          )}

                          {(hasDualPlaceDetails ||
                            (hasGenericDetails && dual)) && (
                            <div
                              className={cn(
                                "space-y-1.5 rounded-md px-3 py-2",
                                toneSurface(visual.tone).soft
                              )}
                            >
                              <DetailRow
                                label={dualLabels.origin}
                                value={routePlaces.origin || null}
                              />
                              <DetailRow
                                label={dualLabels.destination}
                                value={routePlaces.destination || null}
                              />
                              {type === "Zugreisen" ? (
                                <DetailRow
                                  label="Zugnr."
                                  value={event.flight_number}
                                />
                              ) : null}
                              <DetailRow
                                label="Anbieter"
                                value={event.provider}
                              />
                              <DetailRow
                                label="Buchung"
                                value={event.booking_reference}
                              />
                            </div>
                          )}

                          {(hasPlaceDetails ||
                            (hasPlaceMap && !dual && !hasStraightRouteMap) ||
                            (hasGenericDetails &&
                              type !== "Flug" &&
                              !dual)) && (
                            <div
                              className={cn(
                                "grid gap-3",
                                hasPlaceMap &&
                                  !dual &&
                                  !hasStraightRouteMap &&
                                  (hasPlaceDetails ||
                                    (hasGenericDetails &&
                                      type !== "Flug" &&
                                      !dual)) &&
                                  "sm:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)] sm:items-start"
                              )}
                            >
                              {hasPlaceDetails ||
                              (hasGenericDetails &&
                                type !== "Flug" &&
                                !dual) ? (
                              <div
                                className={cn(
                                  "space-y-1.5 rounded-md px-3 py-2",
                                  toneSurface(visual.tone).soft
                                )}
                              >
                                {showPlaceName ? (
                                  <DetailRow
                                    label="Name"
                                    value={event.place_name}
                                  />
                                ) : null}
                                <DetailRow label="Adresse" value={address} />
                                <DetailRow
                                  label="Telefon"
                                  value={
                                    event.phone ? (
                                      <a
                                        href={`tel:${event.phone}`}
                                        className="underline-offset-2 hover:underline"
                                      >
                                        {event.phone}
                                      </a>
                                    ) : null
                                  }
                                />
                                <DetailRow
                                  label="Website"
                                  value={
                                    event.website ? (
                                      <a
                                        href={event.website}
                                        className="break-all text-blue-700 underline"
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {event.website.replace(
                                          /^https?:\/\//,
                                          ""
                                        )}
                                      </a>
                                    ) : null
                                  }
                                />
                                {type !== "Flug" && !dual ? (
                                  <>
                                    <DetailRow
                                      label="Anbieter"
                                      value={event.provider}
                                    />
                                    <DetailRow
                                      label="Buchung"
                                      value={event.booking_reference}
                                    />
                                  </>
                                ) : null}
                              </div>
                              ) : null}
                              {!dual &&
                              !hasStraightRouteMap &&
                              event.lat != null &&
                              event.lon != null ? (
                                <TripMap
                                  points={[
                                    {
                                      lat: event.lat,
                                      lon: event.lon,
                                    },
                                  ]}
                                  heightClassName="h-36"
                                />
                              ) : !dual &&
                                !hasStraightRouteMap &&
                                event.map_image_url ? (
                                <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={event.map_image_url}
                                    alt="Kartenausschnitt"
                                    className="h-36 w-full object-cover"
                                  />
                                </div>
                              ) : null}
                            </div>
                          )}

                          {documentThumbs}

                          {hasFlightRouteMap ? (
                            <TripMap
                              points={[
                                {
                                  lat: event.departure_lat!,
                                  lon: event.departure_lon!,
                                  label: event.departure_airport || "Von",
                                },
                                {
                                  lat: event.arrival_lat!,
                                  lon: event.arrival_lon!,
                                  label: event.arrival_airport || "Nach",
                                },
                              ]}
                              drawRoute
                              routeStyle="greatCircle"
                              heightClassName="h-44"
                            />
                          ) : null}

                          {hasStraightRouteMap ? (
                            <TripMap
                              points={[
                                {
                                  lat: event.departure_lat!,
                                  lon: event.departure_lon!,
                                  label:
                                    routePlaces.origin || dualLabels.origin,
                                },
                                {
                                  lat: event.arrival_lat!,
                                  lon: event.arrival_lon!,
                                  label:
                                    routePlaces.destination ||
                                    dualLabels.destination,
                                },
                              ]}
                              drawRoute
                              routeStyle="straight"
                              heightClassName="h-44"
                            />
                          ) : endpointPoint ? (
                            <TripMap
                              points={[endpointPoint]}
                              heightClassName="h-36"
                            />
                          ) : null}

                          {event.aircraft_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={event.aircraft_image_url}
                              alt={event.aircraft_reg || "Flugzeug"}
                              className="max-h-40 rounded-md object-cover"
                            />
                          ) : null}

                          {event.notes ? (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {event.notes}
                            </p>
                          ) : null}

                          <BelegNotesBlock
                            markdown={event.document_notes_md || ""}
                            show={
                              event.show_document_notes !== 0 &&
                              event.show_document_notes !== false
                            }
                          />

                          {editMode && event.document_notes_md?.trim() ? (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                className="size-3.5 rounded border-border"
                                checked={
                                  event.show_document_notes !== 0 &&
                                  event.show_document_notes !== false
                                }
                                disabled={busy}
                                onChange={(e) =>
                                  void toggleShowDocumentNotes(
                                    event.id,
                                    e.target.checked
                                  )
                                }
                              />
                              Beleg-Infos anzeigen
                            </label>
                          ) : null}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            );
          })
          }
          </div>
        )}
      </div>

      <Dialog
        open={aiZoom != null}
        onOpenChange={(open) => {
          if (!open) setAiZoom(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[min(96vw,40rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{aiZoom?.title || "KI-Bild"}</DialogTitle>
            <DialogDescription>Vergrösserte Ansicht</DialogDescription>
          </DialogHeader>
          {aiZoom ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={aiZoom.url}
              alt={aiZoom.title}
              className="mx-auto max-h-[min(70dvh,36rem)] w-full rounded-md object-contain"
            />
          ) : null}
          {!readOnly && aiZoom?.eventId != null ? (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => void downloadEventAiImage(aiZoom.eventId!)}
              >
                <Download className="size-4" />
                Herunterladen
              </Button>
              {editMode ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  disabled={aiImageBusy}
                  onClick={() => pickReplaceAiImage(aiZoom.eventId!)}
                >
                  <Replace className="size-4" />
                  Ersetzen
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={aiImageEventId != null}
        onOpenChange={(open) => {
          if (!open && !aiImageBusy) setAiImageEventId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>KI-Bild für Aktivität</DialogTitle>
            <DialogDescription>
              Thumbnail-Format (1024², low quality). Prompt wird aus den
              aktuellen Einstellungen und den Aktivitätsdaten neu aufgebaut —
              anpassbar vor dem Erzeugen. Du kannst auch ein gespeichertes Bild
              hochladen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="aiImagePrompt">Prompt</Label>
            <Textarea
              id="aiImagePrompt"
              rows={8}
              value={aiImagePrompt}
              onChange={(e) => {
                setAiImagePrompt(e.target.value);
                setAiImagePromptDirty(true);
              }}
              disabled={aiImageBusy || aiImagePromptLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aiImageReplaceFile">Bild ersetzen / hochladen</Label>
            <Input
              id="aiImageReplaceFile"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              disabled={aiImageBusy || aiImageEventId == null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && aiImageEventId != null) {
                  void replaceAiImage(aiImageEventId, file);
                }
                e.target.value = "";
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={aiImageBusy}
              onClick={() => setAiImageEventId(null)}
            >
              Abbrechen
            </Button>
            {aiImageEventId != null &&
            events.some((e) => e.id === aiImageEventId && e.ai_image_url) ? (
              <Button
                type="button"
                variant="outline"
                disabled={aiImageBusy}
                className="gap-1.5"
                onClick={() => void downloadEventAiImage(aiImageEventId)}
              >
                <Download className="size-4" />
                Laden
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={
                aiImageBusy ||
                aiImagePromptLoading ||
                !aiImagePrompt.trim()
              }
              onClick={() => void generateAiImage()}
              className="gap-1.5"
            >
              <Sparkles className="size-4" />
              {aiImageBusy ? "Generiert…" : "Bild erzeugen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        ref={aiReplaceInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && aiReplaceEventId != null) {
            void replaceAiImage(aiReplaceEventId, file);
          } else {
            setAiReplaceEventId(null);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
