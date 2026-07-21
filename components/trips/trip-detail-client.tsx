"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BedDouble,
  Bus,
  CalendarPlus,
  Car,
  GripVertical,
  ImagePlus,
  Info,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Ship,
  Sparkles,
  Ticket,
  Trash2,
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
  type IconTone,
} from "@/components/layout/icon-circle";
import { DocumentPdfThumb } from "@/components/documents/document-pdf-preview";
import { TripMap } from "@/components/trips/trip-map";
import {
  toDateInputValue,
  toSwissDate,
  toTimeInputValue,
} from "@/lib/utils/dates";
import {
  TRIP_EVENT_TYPES,
  TRIP_STATUSES,
  coerceTripEventType,
} from "@/lib/trips/constants";

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
  return type === "Transfer" || type === "Mietauto" || type === "Mietwagen";
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
      return (
        parsed.notice ||
        parsed.message ||
        "Flugdaten noch nicht verfügbar — Kartenroute aus Flughafen-Codes."
      );
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

function weekdayDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", { weekday: "long" }).format(date);
}

function monthShortDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", { month: "short" })
    .format(date)
    .replace(/\./g, "")
    .toUpperCase();
}

function dayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

function EventCalendarBadge({
  isoDate,
  time,
}: {
  isoDate: string;
  time?: string | null;
}) {
  return (
    <div className="flex w-[4.25rem] shrink-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm sm:w-[4.75rem]">
      <div className="bg-red-600 px-1 py-1 text-center text-[10px] font-black tracking-wide text-white sm:text-[11px]">
        {monthShortDe(isoDate)}
      </div>
      <div className="flex flex-col items-center px-1 pb-1.5 pt-1.5">
        <div className="text-[10px] font-black leading-none text-foreground sm:text-[11px]">
          {weekdayDe(isoDate)}
        </div>
        <div className="mt-1 text-2xl font-black leading-none tabular-nums text-foreground sm:text-3xl">
          {dayNumber(isoDate)}
        </div>
        {time ? (
          <div className="mt-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {time}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EventDateHeader({ event }: { event: TripEvent }) {
  const startIso = parseEventIsoDate(event.start_date);
  if (!startIso) return null;
  const endIso = parseEventIsoDate(event.end_date);
  const showEnd = Boolean(endIso && endIso !== startIso && endIso >= startIso);
  const startTime = toTimeInputValue(event.start_time) || null;
  const endTime = toTimeInputValue(event.end_time) || null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <EventCalendarBadge isoDate={startIso} time={startTime} />
      {showEnd && endIso ? (
        <>
          <span className="text-xs font-bold text-muted-foreground">bis</span>
          <EventCalendarBadge isoDate={endIso} time={endTime} />
        </>
      ) : null}
    </div>
  );
}

function formatEventMetaLine(event: TripEvent): string | null {
  const type = coerceTripEventType(event.event_type);
  const transferRoute =
    type === "Transfer" || isDualPlaceType(type)
      ? event.origin_place && event.destination_place
        ? `${event.origin_place} → ${event.destination_place}`
        : event.origin_place ||
          event.destination_place ||
          (event.location && !textsOverlap(event.location, event.title)
            ? event.location
            : null)
      : null;
  const parts = [
    event.flight_number && type === "Flug" ? event.flight_number : null,
    transferRoute,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
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
    departureAirport: "",
    arrivalAirport: "",
    departureTerminal: "",
    arrivalTerminal: "",
    departureGate: "",
    arrivalGate: "",
    checkInDesk: "",
    baggageBelt: "",
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
    departureAirport: event.departure_airport || "",
    arrivalAirport: event.arrival_airport || "",
    departureTerminal: event.departure_terminal || "",
    arrivalTerminal: event.arrival_terminal || "",
    departureGate: event.departure_gate || "",
    arrivalGate: event.arrival_gate || "",
    checkInDesk: event.check_in_desk || "",
    baggageBelt: event.baggage_belt || "",
  };
}

export function TripDetailClient({ tripId }: { tripId: number }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
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

  const load = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}`);
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
  }, [tripId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, [load]);

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
            (dep && arr ? `${dep} → ${arr}` : dep || arr || null),
        address: eventForm.address || null,
        provider: eventForm.provider || null,
        bookingReference: eventForm.bookingReference || null,
        notes: eventForm.notes || null,
        flightNumber: eventForm.flightNumber || null,
        departureAirport: dep,
        arrivalAirport: arr,
        departureTerminal: eventForm.departureTerminal || null,
        arrivalTerminal: eventForm.arrivalTerminal || null,
        departureGate: eventForm.departureGate || null,
        arrivalGate: eventForm.arrivalGate || null,
        checkInDesk: eventForm.checkInDesk || null,
        baggageBelt: eventForm.baggageBelt || null,
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
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/trips"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
        >
          <ArrowLeft className="size-4" />
          Alle Reisen
        </Link>
      </div>

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

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/trips/${tripId}/ics`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <CalendarPlus className="mr-1.5 size-4" />
          Kalender (ICS)
        </a>
        {editMode ? (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={() => openNewEvent()}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Aktivität hinzufügen
            </Button>
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
          <div className="min-w-[16rem] flex-1 space-y-1.5">
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
          <Button variant="ghost" size="icon" disabled title="Upload">
            <ImagePlus className="size-4" />
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
          className="w-full gap-0 overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border/70">
            <SheetTitle>
              {editingEventId != null
                ? "Aktivität bearbeiten"
                : "Aktivität hinzufügen"}
            </SheetTitle>
            <SheetDescription>
              Typ, Zeiten und Details der Aktivität anpassen.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
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
            ) : null}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notizen</Label>
              <Textarea
                value={eventForm.notes}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>

            {editingEventId != null ? (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Anreichern
                </div>
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
          </div>
          <SheetFooter className="border-t border-border/70">
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

      <div className="space-y-5">
        <h2 className="text-lg font-semibold">Timeline</h2>
        {editMode ? (
          <p className="text-xs text-muted-foreground">
            Ziehe Ereignisse am Griff, um die Reihenfolge zu ändern.
          </p>
        ) : null}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Ereignisse.</p>
        ) : (
          <div className="flex flex-col gap-5">
          {events.map((event) => {
            const visual = eventVisual(event.event_type);
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
                    "relative overflow-visible border-border/50",
                    editingEventId === event.id && "ring-2 ring-foreground/15",
                    editMode &&
                      dragOverEventId === event.id &&
                      "ring-2 ring-teal-400/50"
                  )}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-4 z-[1] flex justify-center">
                    <div className="pointer-events-auto">
                      <EventDateHeader event={event} />
                    </div>
                  </div>
                  <CardContent className="space-y-3 p-4 pl-8">
                    <div className="flex min-h-[5.75rem] items-start gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2 pr-2">
                        {editMode ? (
                          <button
                            type="button"
                            draggable
                            title="Ziehen zum Sortieren"
                            className="mt-1.5 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-background/70 active:cursor-grabbing"
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
                        <div className="min-w-0 max-w-[min(100%,12rem)] sm:max-w-[min(100%,16rem)] lg:max-w-[min(100%,20rem)]">
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
                      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-end gap-1 pl-2">
                        <Badge variant="secondary" className="shrink-0">
                          {coerceTripEventType(event.event_type)}
                        </Badge>
                        {editMode ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditEvent(event)}
                            >
                              <Pencil className="size-3.5" />
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
                      const hasFlightDetails = Boolean(
                        event.airline ||
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
                        dual && (routePlaces.origin || routePlaces.destination)
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
                        !event.notes &&
                        !flightEnrichmentNotice
                      ) {
                        return null;
                      }

                      const documentThumbs = hasDocuments ? (
                        <div
                          className="grid grid-flow-col justify-start gap-2"
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
                            <div className="space-y-1.5 rounded-md bg-background/60 px-3 py-2">
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
                            <div className="space-y-1.5 rounded-md bg-background/60 px-3 py-2">
                              <DetailRow
                                label={dualLabels.origin}
                                value={routePlaces.origin || null}
                              />
                              <DetailRow
                                label={dualLabels.destination}
                                value={routePlaces.destination || null}
                              />
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
                              <div className="space-y-1.5 rounded-md bg-background/60 px-3 py-2">
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
    </div>
  );
}
