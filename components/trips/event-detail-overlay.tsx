"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  BedDouble,
  Bus,
  Calendar,
  Car,
  Clock,
  FilePlus2,
  ImagePlus,
  Info,
  MapPin,
  Pencil,
  Plane,
  Ship,
  Tag,
  Ticket,
  TrainFront,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance-brain/format";
import { toDateInputValue, toTimeInputValue } from "@/lib/utils/dates";
import { coerceTripEventType } from "@/lib/trips/constants";
import {
  IconCircle,
  toneSurface,
  type IconTone,
} from "@/components/layout/icon-circle";
import { AiImagePreview } from "@/components/layout/ai-image-preview";
import { DetailCarousel } from "@/components/layout/detail-carousel";
import { DocumentPdfThumb } from "@/components/documents/document-pdf-preview";
import { BelegNotesBlock } from "@/components/trips/beleg-notes-block";
import {
  CommentCountChip,
  EventDiaryPanel,
} from "@/components/trips/event-diary-panel";
import { EventMapSnippet, getEventMapModel } from "@/components/trips/event-map-snippet";

/** Broad event shape covering every field used across the detail slides. */
export type EventDetailEvent = {
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
  attachments?: Array<{
    id: number;
    title: string | null;
    original_filename: string | null;
    url: string;
    removable?: boolean;
  }>;
  comment_count?: number;
  linked_expenses?: Array<{
    id: number;
    ledger_id: number;
    ledger_title: string;
    description: string | null;
    expense_date: string | null;
    amount: number;
    currency: string;
    amount_base: number;
    base_currency: string;
    paid_by_name: string;
    category_label: string | null;
  }>;
};

// ---- small self-contained helpers (duplicated from trip-detail-client to keep this file standalone) ----

const EVENT_VISUALS: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  Flug: { icon: Plane, tone: "green" },
  Zugreisen: { icon: TrainFront, tone: "green" },
  Bahn: { icon: TrainFront, tone: "green" },
  Mietauto: { icon: Car, tone: "green" },
  Mietwagen: { icon: Car, tone: "green" },
  Transfer: { icon: Bus, tone: "green" },
  Hotel: { icon: BedDouble, tone: "green" },
  Unterkunft: { icon: BedDouble, tone: "green" },
  Kreuzfahrt: { icon: Ship, tone: "green" },
  Ausflug: { icon: MapPin, tone: "green" },
  Aktivität: { icon: MapPin, tone: "green" },
  Sonstiges: { icon: Ticket, tone: "green" },
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

function splitTransferPlaces(event: EventDetailEvent): {
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

function eventIsBooked(event: EventDetailEvent): boolean {
  const docCount =
    (event.documents?.length || 0) + (event.attachments?.length || 0);
  return Boolean(event.booking_reference?.trim()) || docCount > 0;
}

function parseEventIsoDate(raw: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((raw || "").trim());
  if (m) return m[1];
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((raw || "").trim());
  if (swiss) {
    return `${swiss[3]}-${swiss[2].padStart(2, "0")}-${swiss[1].padStart(2, "0")}`;
  }
  return null;
}

/** Short "Mo, 3. Nov" / "Mo, 3. Nov · 14:00–16:00" style line under the title. */
function formatEventDateLine(event: EventDetailEvent): string | null {
  const startIso = parseEventIsoDate(event.start_date);
  if (!startIso) return null;
  const endIso = parseEventIsoDate(event.end_date);
  const startTime = toTimeInputValue(event.start_time) || null;
  const endTime = toTimeInputValue(event.end_time) || null;
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("de-CH", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(y, m - 1, d));
  };
  const showEnd = Boolean(endIso && endIso !== startIso && endIso >= startIso);
  if (showEnd && endIso) {
    return `${fmtDate(startIso)} – ${fmtDate(endIso)}`;
  }
  const datePart = fmtDate(startIso);
  const timePart = startTime
    ? endTime
      ? `${startTime}–${endTime}`
      : startTime
    : null;
  return timePart ? `${datePart} · ${timePart}` : datePart;
}

type DenseFactItem = { key: string; icon: LucideIcon; label: string };

function eventDenseFactItems(event: EventDetailEvent): DenseFactItem[] {
  const items: DenseFactItem[] = [];
  const type = coerceTripEventType(event.event_type);
  if (event.flight_number && (type === "Flug" || type === "Zugreisen")) {
    items.push({ key: "flight", icon: Ticket, label: event.flight_number });
  }
  const st = toTimeInputValue(event.start_time);
  const et = toTimeInputValue(event.end_time);
  if (st) {
    items.push({ key: "time", icon: Clock, label: et ? `${st}–${et}` : st });
  }
  if (event.cabin_class) {
    items.push({ key: "cabin", icon: Armchair, label: event.cabin_class });
  }
  const linked = event.linked_expenses || [];
  if (linked.length > 0) {
    const sum = linked.reduce(
      (acc, e) => acc + (e.amount_base || e.amount || 0),
      0
    );
    items.push({
      key: "amount",
      icon: Tag,
      label: formatMoney(sum, linked[0].base_currency || "CHF"),
    });
  }
  return items;
}

function eventRouteLine(event: EventDetailEvent): string | null {
  const type = coerceTripEventType(event.event_type);
  if (isDualPlaceType(type)) {
    const places = splitTransferPlaces(event);
    if (places.origin && places.destination) {
      return `${places.origin} → ${places.destination}`;
    }
    return places.origin || places.destination || null;
  }
  if (type === "Flug" && (event.departure_airport || event.arrival_airport)) {
    return [event.departure_airport, event.arrival_airport]
      .filter(Boolean)
      .join(" → ");
  }
  return null;
}

function EventStatusPill({ event }: { event: EventDetailEvent }) {
  const booked = eventIsBooked(event);
  return (
    <Badge
      variant={booked ? "secondary" : "outline"}
      className={cn(
        "h-5 shrink-0 px-1.5 text-[10px] font-semibold",
        booked
          ? "border-[var(--brand-finance)]/25 bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
          : "text-muted-foreground"
      )}
    >
      {booked ? "Gebucht" : "Geplant"}
    </Badge>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 text-foreground">{value}</div>
    </div>
  );
}

// ---- overlay ----

export function EventDetailOverlay({
  open,
  onOpenChange,
  event,
  tripId,
  readOnly = false,
  shareToken,
  editMode = false,
  busy = false,
  aiImageBusy = false,
  onEdit,
  onLinkDocs,
  onAiImage,
  onDelete,
  onUnlinkDoc,
  onDeleteAttachment,
  onToggleShowDocumentNotes,
  onOpenAiZoom,
  onCommentCountChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventDetailEvent | null | undefined;
  tripId: number;
  readOnly?: boolean;
  shareToken?: string;
  editMode?: boolean;
  busy?: boolean;
  aiImageBusy?: boolean;
  onEdit?: (event: EventDetailEvent) => void;
  onLinkDocs?: (eventId: number) => void;
  onAiImage?: (event: EventDetailEvent) => void;
  onDelete?: (eventId: number) => void;
  onUnlinkDoc?: (eventId: number, documentId: number) => void;
  onDeleteAttachment?: (eventId: number, attachmentId: number) => void;
  onToggleShowDocumentNotes?: (eventId: number, show: boolean) => void;
  onOpenAiZoom?: (payload: { url: string; title: string; eventId: number }) => void;
  onCommentCountChange?: (eventId: number, count: number) => void;
}) {
  if (!event) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent className="hidden" />
      </Dialog>
    );
  }

  const visual = eventVisual(event.event_type);
  const type = coerceTripEventType(event.event_type);
  const dual = isDualPlaceType(type);
  const dualLabels = dualPlaceLabels(type);
  const routePlaces = splitTransferPlaces(event);
  const dateLine = formatEventDateLine(event);
  const routeLine = eventRouteLine(event);
  const denseFacts = eventDenseFactItems(event);
  const mapModel = getEventMapModel(event);

  const showPlaceName =
    Boolean(event.place_name) && !textsOverlap(event.place_name, event.title);
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
    showPlaceName || address || event.phone || event.website
  );
  const hasGenericDetails = Boolean(
    event.provider ||
      event.booking_reference ||
      (type !== "Flug" && event.flight_number)
  );
  const hasDetailsSlide =
    hasFlightDetails || hasDualPlaceDetails || hasPlaceDetails || hasGenericDetails;

  const documents = event.documents || [];
  const attachments = event.attachments || [];
  const hasDocuments = documents.length > 0 || attachments.length > 0;
  const flightEnrichmentNotice =
    type === "Flug" ? parseFlightEnrichmentNotice(event.enrichment_json) : null;
  const hasDocumentNotes = Boolean(
    event.document_notes_md?.trim() &&
      event.show_document_notes !== 0 &&
      event.show_document_notes !== false
  );
  const hasBelegSlide = Boolean(
    hasDocuments ||
      event.notes?.trim() ||
      event.aircraft_image_url ||
      flightEnrichmentNotice ||
      hasDocumentNotes ||
      (editMode && event.document_notes_md?.trim())
  );

  const canEdit = !readOnly;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="flex max-h-[92dvh] w-[min(96vw,26rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3 pr-12 text-left">
          <DialogTitle className="truncate text-base">{event.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Details und Aktionen zur Aktivität
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
          <DetailCarousel
            resetKey={event.id}
            className="h-full max-h-[min(78dvh,40rem)] sm:max-h-[min(80dvh,44rem)]"
          >
            {/* 1. Übersicht */}
            <div className="flex flex-col items-center gap-3 px-2 pb-2 pt-1 text-center sm:gap-4 sm:px-4">
              {event.ai_image_url ? (
                <AiImagePreview
                  src={event.ai_image_url}
                  brand="travel"
                  imageClassName="h-36 w-36 rounded-2xl object-cover sm:h-48 sm:w-48 md:h-56 md:w-56"
                  onOpen={() =>
                    onOpenAiZoom?.({
                      url: event.ai_image_url!,
                      title: event.title,
                      eventId: event.id,
                    })
                  }
                />
              ) : (
                <IconCircle
                  icon={visual.icon}
                  tone="green"
                  shape="rounded"
                  size="lg"
                  className="h-20 w-20 sm:h-24 sm:w-24 [&_svg]:h-9 [&_svg]:w-9 sm:[&_svg]:h-11 sm:[&_svg]:w-11"
                />
              )}
              <div className="min-w-0 space-y-1.5">
                <p className="text-lg font-black leading-snug tracking-tight text-foreground sm:text-2xl">
                  {event.title}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <EventStatusPill event={event} />
                  <CommentCountChip count={event.comment_count || 0} />
                </div>
                {dateLine ? (
                  <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="size-4 shrink-0" />
                    {dateLine}
                  </p>
                ) : null}
                {routeLine ? (
                  <p className="text-sm font-medium text-foreground">
                    {routeLine}
                  </p>
                ) : null}
              </div>
              {denseFacts.length > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {denseFacts.map((f) => (
                    <span
                      key={f.key}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-finance-soft)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--brand-finance)]"
                    >
                      <f.icon className="size-3.5 shrink-0" strokeWidth={2} />
                      {f.label}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Wischen für weitere Infos
              </p>
            </div>

            {/* 2. Details */}
            {hasDetailsSlide ? (
              <div className="space-y-3 px-2 py-1">
                <p className="text-sm font-semibold text-foreground">Details</p>

                {hasFlightDetails ? (
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
                        event.departure_airport || event.arrival_airport
                          ? `${event.departure_airport || "—"} → ${
                              event.arrival_airport || "—"
                            }`
                          : null
                      }
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
                        event.departure_gate ? `Gate ${event.departure_gate}` : null,
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
                        event.arrival_gate ? `Gate ${event.arrival_gate}` : null,
                        event.baggage_belt ? `Gepäck ${event.baggage_belt}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                    <DetailRow label="Buchung" value={event.booking_reference} />
                    <DetailRow
                      label="Anbieter"
                      value={
                        event.provider &&
                        event.airline &&
                        event.provider.trim().toLowerCase() ===
                          event.airline.trim().toLowerCase()
                          ? null
                          : event.provider
                      }
                    />
                  </div>
                ) : null}

                {hasDualPlaceDetails ? (
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
                      <DetailRow label="Zugnr." value={event.flight_number} />
                    ) : null}
                    <DetailRow label="Anbieter" value={event.provider} />
                    <DetailRow label="Buchung" value={event.booking_reference} />
                  </div>
                ) : null}

                {hasPlaceDetails || (hasGenericDetails && type !== "Flug" && !dual) ? (
                  <div
                    className={cn(
                      "space-y-1.5 rounded-md px-3 py-2",
                      toneSurface(visual.tone).soft
                    )}
                  >
                    {showPlaceName ? (
                      <DetailRow label="Name" value={event.place_name} />
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
                            className="break-all text-primary underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {event.website.replace(/^https?:\/\//, "")}
                          </a>
                        ) : null
                      }
                    />
                    {type !== "Flug" && !dual ? (
                      <>
                        <DetailRow label="Anbieter" value={event.provider} />
                        <DetailRow label="Buchung" value={event.booking_reference} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 3. Karte */}
            {mapModel ? (
              <div className="space-y-2 px-2 py-1">
                <p className="text-sm font-semibold text-foreground">Karte</p>
                <EventMapSnippet
                  event={event}
                  heightClassName="h-56 sm:h-72"
                  compact={false}
                />
              </div>
            ) : null}

            {/* 4. Belege & Notizen */}
            {hasBelegSlide ? (
              <div className="space-y-3 px-2 py-1">
                <p className="text-sm font-semibold text-foreground">
                  Belege & Notizen
                </p>

                {flightEnrichmentNotice ? (
                  <div
                    role="status"
                    className="flex gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
                  >
                    <Info
                      className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
                      aria-hidden
                    />
                    <p className="leading-snug">{flightEnrichmentNotice}</p>
                  </div>
                ) : null}

                {hasDocuments ? (
                  <div className="max-w-full overflow-x-auto pb-1">
                    <div
                      className="grid w-max grid-flow-col justify-start gap-2"
                      style={{ gridAutoColumns: "3.5rem" }}
                    >
                      {documents.map((doc) => (
                        <DocumentPdfThumb
                          key={`p-${doc.id}`}
                          paperlessId={doc.paperless_id}
                          title={doc.title}
                          removing={busy}
                          onRemove={
                            editMode && doc.removable !== false
                              ? () => onUnlinkDoc?.(event.id, doc.id)
                              : undefined
                          }
                        />
                      ))}
                      {attachments.map((att) => (
                        <DocumentPdfThumb
                          key={`a-${att.id}`}
                          pdfUrl={att.url}
                          thumbUrl={null}
                          title={att.title || att.original_filename}
                          removing={busy}
                          onRemove={
                            editMode && att.removable !== false
                              ? () => onDeleteAttachment?.(event.id, att.id)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
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
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
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
                        onToggleShowDocumentNotes?.(event.id, e.target.checked)
                      }
                    />
                    Beleg-Infos anzeigen
                  </label>
                ) : null}
              </div>
            ) : null}

            {/* 5. Tagebuch */}
            <div className="px-2 py-1">
              <EventDiaryPanel
                tripId={tripId}
                eventId={event.id}
                readOnly={readOnly}
                shareToken={shareToken || undefined}
                onCountChange={(count) => onCommentCountChange?.(event.id, count)}
              />
            </div>

            {/* 6. Aktionen */}
            {!readOnly ? (
              <div className="space-y-2 px-2 py-1">
                <p className="text-sm font-semibold text-foreground">Aktionen</p>
                <div className="grid gap-1.5">
                  {canEdit && onEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start"
                      onClick={() => onEdit(event)}
                    >
                      <Pencil className="mr-2 size-4" />
                      Ändern
                    </Button>
                  ) : null}
                  {onLinkDocs ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start"
                      disabled={busy}
                      onClick={() => onLinkDocs(event.id)}
                    >
                      <FilePlus2 className="mr-2 size-4" />
                      Beleg / PDF
                    </Button>
                  ) : null}
                  {onAiImage ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start"
                      disabled={busy || aiImageBusy}
                      onClick={() => onAiImage(event)}
                    >
                      <ImagePlus className="mr-2 size-4" />
                      KI-Bild
                    </Button>
                  ) : null}
                  {editMode && onDelete ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="justify-start"
                      onClick={() => onDelete(event.id)}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Löschen
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </DetailCarousel>
        </div>
      </DialogContent>
    </Dialog>
  );
}
