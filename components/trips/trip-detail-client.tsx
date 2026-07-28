"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Armchair,
  ArrowLeft,
  BedDouble,
  BookOpen,
  Bus,
  Calendar,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  GripVertical,
  ImagePlus,
  Info,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Replace,
  Ship,
  Sparkles,
  Tag,
  Ticket,
  TrainFront,
  Trash2,
  X,
  FilePlus2,
  FileText,
  LayoutList,
  MoreHorizontal,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateDe, formatLinkedExpenseMoneyParen, formatMoney } from "@/lib/finance-brain/format";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/layout/page-primitives";
import { AiImagePreview } from "@/components/layout/ai-image-preview";
import {
  IconCircle,
  pageVisuals,
  toneSurface,
  type IconTone,
} from "@/components/layout/icon-circle";
import {
  DateTimelineStrip,
  scrollToDateAnchor,
  stickyDetailChromeClass,
  stickyStripClass,
  uniqueSortedIsoDates,
} from "@/components/layout/date-timeline-strip";
import {
  TodayAgendaWidget,
  pickAgendaDay,
} from "@/components/trips/today-agenda-widget";
import { EventDetailOverlay } from "@/components/trips/event-detail-overlay";
import { EventMapSnippet, getEventMapModel } from "@/components/trips/event-map-snippet";
import {
  SoftChip,
  SoftChipRow,
  SpeedDialFab,
} from "@/components/layout/speed-dial-fab";
import { useIsStandalonePwa } from "@/hooks/use-standalone-pwa";
import { useActiveDateFromScroll } from "@/hooks/use-active-date-from-scroll";
import { DocumentPdfThumb } from "@/components/documents/document-pdf-preview";
import {
  CommentCountChip,
} from "@/components/trips/event-diary-panel";
import { TripMap } from "@/components/trips/trip-map";
import { TripExportMenu } from "@/components/trips/trip-export-menu";
import { TripFinanceLedgerCard } from "@/components/finance-brain/trip-finance-ledger-card";
import { TripTravelersCard } from "@/components/trips/trip-travelers-card";
import { BelegNotesBlock } from "@/components/trips/beleg-notes-block";
import {
  TripTabNav,
  parseTripDetailTab,
  type TripDetailTab,
  type TripTabItem,
} from "@/components/trips/trip-tab-nav";
import type { AppTabOverflowItem } from "@/components/layout/app-tab-nav";
import {
  fetchCurrentWeather,
  weatherConditionIcon,
  type CurrentWeather,
} from "@/lib/trips/weather";
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
    exchange_rate?: number | null;
    amount_base: number;
    base_currency: string;
    paid_by_name: string;
    category_label: string | null;
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
  source?: string;
  stopRef?: string;
};

type TrainConnectionOption = {
  id: string;
  label: string;
  summary: string;
  startTime?: string;
  endTime?: string;
  changes: number;
  trip: Record<string, unknown>;
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  active: "Unterwegs",
  done: "Abgeschlossen",
  cancelled: "Abgesagt",
};

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

/** Short "Mo, 3. Nov" / "Mo, 3. Nov · 14:00–16:00" style line for under the title. */
function formatEventDateLine(event: TripEvent): string | null {
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

/** Full de-CH day heading, e.g. "Montag, 3. November 2025", for day anchors. */
function formatEventDayHeadingDe(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

function EventDayHeading({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-1.5 pt-1 pb-1.5 pl-0.5 text-foreground">
      <Calendar className="size-4 shrink-0 text-muted-foreground" />
      <h3 className="truncate text-sm font-bold sm:text-base">
        {formatEventDayHeadingDe(iso)}
      </h3>
    </div>
  );
}

/** Time · dot · dashed connector rail to the left of an event card. */
function EventTimelineRail({
  event,
  showConnector,
}: {
  event: TripEvent;
  showConnector: boolean;
}) {
  const time = toTimeInputValue(event.start_time);
  return (
    <div className="flex w-8 shrink-0 flex-col items-center sm:w-9">
      <span className="h-3.5 text-[10px] font-semibold tabular-nums text-muted-foreground sm:text-[11px]">
        {time || ""}
      </span>
      <span
        className="mt-1 size-2.5 shrink-0 rounded-full bg-[var(--brand-finance)] ring-4 ring-background"
        aria-hidden
      />
      <span
        className={cn(
          "mt-1 w-px flex-1 border-l",
          showConnector ? "border-dashed border-border/70" : "border-transparent"
        )}
        aria-hidden
      />
    </div>
  );
}

/** Booked (has a booking reference or any linked docs/attachments) vs. planned. */
function eventIsBooked(event: TripEvent): boolean {
  const docCount =
    (event.documents?.length || 0) + (event.attachments?.length || 0);
  return Boolean(event.booking_reference?.trim()) || docCount > 0;
}

function EventStatusPill({
  event,
  className,
}: {
  event: TripEvent;
  className?: string;
}) {
  const booked = eventIsBooked(event);
  return (
    <Badge
      variant={booked ? "secondary" : "outline"}
      className={cn(
        "h-5 shrink-0 px-1.5 text-[10px] font-semibold",
        booked
          ? "border-[var(--brand-finance)]/25 bg-[var(--brand-finance-soft)] text-[var(--brand-finance)]"
          : "text-muted-foreground",
        className
      )}
    >
      {booked ? "Gebucht" : "Geplant"}
    </Badge>
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
  const flightRoute =
    type === "Flug" &&
    (event.departure_airport || event.arrival_airport)
      ? [event.departure_airport, event.arrival_airport]
          .filter(Boolean)
          .join(" → ")
      : null;
  const parts = [
    event.flight_number && (type === "Flug" || type === "Zugreisen")
      ? event.flight_number
      : null,
    transferRoute || flightRoute,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type DenseFactItem = { key: string; icon: LucideIcon; label: string };

/** Key facts for the right column, each tagged with a small icon. */
function eventDenseFactItems(event: TripEvent): DenseFactItem[] {
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

/** Key facts for the right column — one place only (cards + compact). */
function eventDenseFacts(event: TripEvent): string[] {
  return eventDenseFactItems(event).map((f) => f.label);
}

function EventDenseFactsColumn({
  event,
  size = "md",
  onOpenComments,
}: {
  event: TripEvent;
  size?: "sm" | "md";
  onOpenComments?: () => void;
}) {
  const facts = eventDenseFactItems(event);
  const docCount =
    (event.documents?.length || 0) + (event.attachments?.length || 0);
  const financeCount = event.linked_expenses?.length || 0;
  const commentCount = event.comment_count || 0;
  if (
    facts.length === 0 &&
    docCount === 0 &&
    financeCount === 0 &&
    !(commentCount > 0 || onOpenComments)
  ) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-start gap-1.5",
        size === "sm" ? "min-w-[6.5rem]" : "min-w-[7.5rem] sm:min-w-[9rem]"
      )}
    >
      {facts.map((f) => (
        <span
          key={f.key}
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold tabular-nums text-foreground/90",
            size === "sm" ? "text-[11px] leading-snug" : "text-xs sm:text-sm"
          )}
        >
          <f.icon
            className="size-3.5 shrink-0 text-[var(--brand-finance)]"
            strokeWidth={2}
          />
          {f.label}
        </span>
      ))}
      {docCount > 0 ? (
        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[var(--brand-finance-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-finance)]">
          <FileText className="size-3" />
          {docCount} {docCount === 1 ? "Beleg" : "Belege"}
        </span>
      ) : null}
      {financeCount > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-finance-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-finance)]">
          <Wallet className="size-3" />
          {financeCount === 1 ? "1 FinanzBuddy" : `${financeCount} FinanzBuddy`}
        </span>
      ) : null}
      {onOpenComments ? (
        <CommentCountChip
          count={commentCount}
          showWhenEmpty
          onClick={onOpenComments}
          className="mt-0.5 border-[var(--brand-docs)]/25 bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]"
        />
      ) : null}
    </div>
  );
}

/** Fixed-size AI thumb in the card middle (same for every event). ~3–4 text lines. */
function EventCardAiImage({
  event,
  onOpen,
}: {
  event: TripEvent;
  onOpen: () => void;
}) {
  if (!event.ai_image_url) return null;
  return (
    <AiImagePreview
      src={event.ai_image_url}
      alt=""
      brand="travel"
      className="shrink-0 self-center"
      imageClassName="h-[4.5rem] w-[4.5rem] rounded-lg object-cover"
      onOpen={onOpen}
    />
  );
}

function formatCompactDetailLine(event: TripEvent): string | null {
  // Only route/context not already in the dense right column.
  const type = coerceTripEventType(event.event_type);
  const dense = new Set(eventDenseFacts(event));
  const transferRoute = isDualPlaceType(type)
    ? event.origin_place && event.destination_place
      ? `${event.origin_place} → ${event.destination_place}`
      : event.origin_place || event.destination_place || null
    : null;
  const flightRoute =
    type === "Flug" && (event.departure_airport || event.arrival_airport)
      ? [event.departure_airport, event.arrival_airport]
          .filter(Boolean)
          .join(" → ")
      : null;
  const route = transferRoute || flightRoute;
  if (!route || dense.has(route)) return null;
  // Skip if flight_number alone was the only meta (already in dense).
  return route;
}

/** Desktop timeline only — PWA/mobile cards stay compact; details live in the overlay. */
function EventLinkedExpenses({
  expenses,
  className,
  hideAmount = false,
}: {
  expenses: NonNullable<TripEvent["linked_expenses"]>;
  className?: string;
  hideAmount?: boolean;
}) {
  if (!expenses.length) return null;
  return (
    <div className={cn("space-y-1", className)}>
      {expenses.map((exp) => {
        const label = hideAmount
          ? exp.ledger_title || "Abrechnung"
          : exp.description?.trim() ||
            exp.category_label ||
            exp.ledger_title ||
            "Ausgabe";
        const moneyParen = formatLinkedExpenseMoneyParen({
          amount: exp.amount,
          currency: exp.currency,
          amountBase: exp.amount_base,
          baseCurrency: exp.base_currency || "CHF",
          exchangeRate: exp.exchange_rate,
        });
        return (
          <p
            key={exp.id}
            className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Wallet className="size-3 shrink-0 text-[var(--brand-finance)]" />
            <Link
              href={`/finance-brain/${exp.ledger_id}`}
              className="min-w-0 font-medium text-foreground underline-offset-2 hover:underline"
            >
              {label}
            </Link>
            <span className="min-w-0 text-muted-foreground">
              {moneyParen}
              {exp.paid_by_name ? ` · ${exp.paid_by_name}` : ""}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function EventActionsMenu({
  items,
  triggerClassName,
  triggerSize = "icon-xs",
  triggerVariant = "ghost",
  align = "end",
}: {
  items: Array<{
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
    variant?: "default" | "destructive";
  }>;
  triggerClassName?: string;
  triggerSize?: "icon-xs" | "icon-sm" | "sm";
  triggerVariant?: "ghost" | "outline" | "secondary";
  align?: "start" | "end" | "center";
}) {
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size={triggerSize}
            variant={triggerVariant}
            className={triggerClassName}
            aria-label="Mehr"
          />
        }
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-auto min-w-44">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            variant={item.variant}
            onClick={item.onClick}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lädt Reise…</p>
      }
    >
      <TripDetailInner tripId={tripId} shareToken={shareToken} />
    </Suspense>
  );
}

function TripDetailInner({
  tripId,
  shareToken,
}: {
  tripId: number;
  shareToken?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const readOnly = Boolean(shareToken);
  const isPwa = useIsStandalonePwa();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [travelerCount, setTravelerCount] = useState(0);
  const [editMode, setEditMode] = useState(false);
  /** Mobile edit toolbar focuses actions on one event. */
  const [editFocusEventId, setEditFocusEventId] = useState<number | null>(null);
  const [detailEventId, setDetailEventId] = useState<number | null>(null);
  const [detailSlide, setDetailSlide] = useState<"overview" | "diary">(
    "overview"
  );
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
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [diaryBusy, setDiaryBusy] = useState(false);
  const [diaryRecipients, setDiaryRecipients] = useState<
    Array<{ recipientKey: string; displayName: string; email: string }>
  >([]);
  const [diarySelected, setDiarySelected] = useState<string[]>([]);
  const [placeCandidates, setPlaceCandidates] = useState<
    Record<number, PlaceCandidate[]>
  >({});
  const [trainConnectionOptions, setTrainConnectionOptions] = useState<
    Record<number, TrainConnectionOption[]>
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

  /** Deep-link: /trips/[id]?event=123 opens the event overlay once. */
  const openedEventQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (events.length === 0) return;
    const raw = searchParams.get("event");
    if (!raw) return;
    if (openedEventQueryRef.current === raw) return;
    const eventId = Number(raw);
    if (!Number.isInteger(eventId) || eventId <= 0) return;
    if (!events.some((e) => e.id === eventId)) return;
    openedEventQueryRef.current = raw;
    setDetailEventId(eventId);
    setDetailSlide("overview");
    const iso = parseEventIsoDate(
      events.find((e) => e.id === eventId)?.start_date
    );
    if (iso) {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-event-id="${eventId}"]`
        );
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else scrollToDateAnchor(`event-day-${iso}`);
      });
    }
  }, [events, searchParams]);

  const eventDayDates = useMemo(
    () =>
      uniqueSortedIsoDates(events.map((e) => parseEventIsoDate(e.start_date))),
    [events]
  );

  const eventDayAnchorId = useCallback(
    (iso: string) => `event-day-${iso}`,
    []
  );
  const activeEventDay = useActiveDateFromScroll(
    eventDayDates,
    eventDayAnchorId
  );

  const firstOfDayEventIds = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<number>();
    for (const event of events) {
      const iso = parseEventIsoDate(event.start_date);
      if (!iso || seen.has(iso)) continue;
      seen.add(iso);
      ids.add(event.id);
    }
    return ids;
  }, [events]);

  const stickyEnabled = !isPwa;
  const stickyBelowHeader = !readOnly;

  const todayAgenda = useMemo(
    () => pickAgendaDay(events, parseEventIsoDate),
    [events]
  );

  function scrollToAgendaEvent(eventId: number, iso: string) {
    const el = document.querySelector<HTMLElement>(
      `[data-event-id="${eventId}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    scrollToDateAnchor(`event-day-${iso}`);
  }

  const weatherPoint = useMemo(() => {
    for (const e of events) {
      const label =
        e.place_name ||
        e.arrival_airport ||
        e.destination_place ||
        e.departure_airport ||
        e.origin_place ||
        (e.location && !textsOverlap(e.location, e.title) ? e.location : null) ||
        e.title;
      if (e.lat != null && e.lon != null) {
        return { lat: e.lat, lon: e.lon, label };
      }
      if (e.arrival_lat != null && e.arrival_lon != null) {
        return {
          lat: e.arrival_lat,
          lon: e.arrival_lon,
          label: e.arrival_airport || e.destination_place || label,
        };
      }
      if (e.departure_lat != null && e.departure_lon != null) {
        return {
          lat: e.departure_lat,
          lon: e.departure_lon,
          label: e.departure_airport || e.origin_place || label,
        };
      }
    }
    return null;
  }, [events]);

  const [weather, setWeather] = useState<CurrentWeather | null>(null);

  useEffect(() => {
    if (!weatherPoint) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    void fetchCurrentWeather(weatherPoint.lat, weatherPoint.lon)
      .then((w) => {
        if (!cancelled) setWeather(w);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [weatherPoint?.lat, weatherPoint?.lon]);

  const missingChecklist = useMemo(() => {
    const types = new Set(
      events.map((e) => coerceTripEventType(e.event_type))
    );
    const missing: string[] = [];
    // Only essential trip building blocks — not "Ausflug/Aktivität" (too noisy).
    if (
      events.length > 0 &&
      !types.has("Flug") &&
      !types.has("Zugreisen") &&
      !types.has("Transfer") &&
      !types.has("Mietauto")
    ) {
      missing.push("Transport");
    }
    if (
      events.length > 0 &&
      !types.has("Hotel") &&
      !types.has("Unterkunft") &&
      !types.has("Kreuzfahrt")
    ) {
      missing.push("Unterkunft");
    }
    const bookable = events.filter((e) => {
      const t = coerceTripEventType(e.event_type);
      return t === "Flug" || t === "Hotel" || t === "Unterkunft" || t === "Kreuzfahrt";
    });
    if (
      bookable.length > 0 &&
      !bookable.some(
        (e) => (e.documents?.length || 0) + (e.attachments?.length || 0) > 0
      )
    ) {
      missing.push("Belege");
    }
    return missing;
  }, [events]);

  const routeMapPoints = useMemo(() => {
    const pts: Array<{ lat: number; lon: number; label?: string }> = [];
    for (const e of events) {
      if (e.lat != null && e.lon != null) {
        pts.push({ lat: e.lat, lon: e.lon, label: e.title });
      } else if (e.departure_lat != null && e.departure_lon != null) {
        pts.push({
          lat: e.departure_lat,
          lon: e.departure_lon,
          label: e.title,
        });
      }
      if (
        e.arrival_lat != null &&
        e.arrival_lon != null &&
        (e.departure_lat !== e.arrival_lat || e.departure_lon !== e.arrival_lon)
      ) {
        pts.push({
          lat: e.arrival_lat,
          lon: e.arrival_lon,
          label: e.title,
        });
      }
    }
    return pts.slice(0, 12);
  }, [events]);

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

  function openNewEvent(presetType?: string) {
    setEditingEventId(null);
    const form = createEmptyEventForm();
    if (presetType) {
      form.eventType = coerceTripEventType(presetType);
    }
    setEventForm(form);
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

  async function openDiaryDialog() {
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/travel-diary-mail`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Empfänger laden fehlgeschlagen");
      }
      const list = (json.recipients || []) as Array<{
        recipientKey: string;
        displayName: string;
        email: string;
      }>;
      if (list.length === 0) {
        throw new Error("Keine Teilnehmer mit E-Mail-Adresse");
      }
      setDiaryRecipients(list);
      setDiarySelected(list.map((r) => r.recipientKey));
      setDiaryOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendDiaryMail() {
    if (diarySelected.length === 0) return;
    setDiaryBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/travel-diary-mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientKeys: diarySelected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mailversand fehlgeschlagen");
      const sent = typeof json.sent === "number" ? json.sent : 0;
      setDiaryOpen(false);
      setStatus(
        sent > 0
          ? `Reisetagebuch gesendet (${sent} Empfänger).`
          : "Reisetagebuch gesendet."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiaryBusy(false);
    }
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

  async function enrichTrain(
    eventId: number,
    opts?: { departAfter?: string; append?: boolean }
  ) {
    setError(null);
    try {
      if (editingEventId === eventId && !opts?.append) {
        const saved = await saveEvent({ keepEditing: true });
        if (saved == null) return;
      }
      setBusy(true);
      if (!opts?.append) {
        setTrainConnectionOptions((prev) => ({ ...prev, [eventId]: [] }));
      }
      const departAfter =
        opts?.departAfter?.trim() ||
        (editingEventId === eventId
          ? toTimeInputValue(eventForm.startTime) || eventForm.startTime.trim()
          : "") ||
        undefined;
      const date =
        (editingEventId === eventId
          ? toDateInputValue(eventForm.startDate)
          : null) || undefined;
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-train`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "search",
            departAfter: departAfter || undefined,
            date: date || undefined,
            numberOfResults: 20,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suche fehlgeschlagen");
      const options = (data.options || []) as TrainConnectionOption[];
      setTrainConnectionOptions((prev) => {
        if (!opts?.append) return { ...prev, [eventId]: options };
        const existing = prev[eventId] || [];
        const seen = new Set(existing.map((o) => o.id));
        const merged = [...existing];
        for (const option of options) {
          if (seen.has(option.id)) continue;
          seen.add(option.id);
          merged.push(option);
        }
        return { ...prev, [eventId]: merged };
      });
      if (options.length === 0) {
        setStatus("Keine Zugverbindungen gefunden.");
      } else {
        setStatus(
          opts?.append
            ? `${options.length} weitere Verbindungen geladen.`
            : `${options.length} Verbindungen — bitte auswählen.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function nextDepartAfterFromOptions(
    eventId: number
  ): string | null {
    const options = trainConnectionOptions[eventId] || [];
    const last = options[options.length - 1];
    if (!last?.startTime) return null;
    const start = new Date(last.startTime);
    if (Number.isNaN(start.getTime())) return null;
    start.setMinutes(start.getMinutes() + 1);
    return new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(start);
  }

  async function applyTrainConnection(
    eventId: number,
    option: TrainConnectionOption
  ) {
    setError(null);
    try {
      setBusy(true);
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-train`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "apply",
            trip: option.trip,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
      setTrainConnectionOptions((prev) => ({ ...prev, [eventId]: [] }));
      await load();
      if (data.event && editingEventId === eventId) {
        setEventForm(eventToForm(data.event as TripEvent));
      }
      setStatus(
        typeof data.warning === "string" && data.warning.trim()
          ? data.warning
          : "Zugverbindung übernommen."
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
      const isTrain =
        (editingEventId === eventId
          ? eventForm.eventType
          : coerceTripEventType(event?.event_type || "")) === "Zugreisen";
      const res = await fetch(
        isTrain
          ? `/api/trips/${tripId}/events/${eventId}/enrich-train`
          : `/api/trips/${tripId}/events/${eventId}/enrich-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isTrain
              ? {
                  action: "search-station",
                  query: query || undefined,
                }
              : {
                  query: query || undefined,
                  target,
                }
          ),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suche fehlgeschlagen");
      const candidates = (data.candidates || []) as PlaceCandidate[];
      setPlaceCandidates((prev) => ({
        ...prev,
        [eventId]: candidates.map((c) =>
          isTrain
            ? {
                osmId: c.stopRef || c.osmId,
                name: c.name,
                displayName: c.displayName || c.name,
                address: null,
                phone: null,
                website: null,
                lat: c.lat,
                lon: c.lon,
                source: "ojp",
                stopRef: c.stopRef,
              }
            : c
        ),
      }));
      if (candidates.length === 0) {
        setStatus(isTrain ? "Keine Bahnhofstreffer gefunden." : "Keine OSM-Treffer gefunden.");
      } else {
        setStatus(
          isTrain
            ? `${candidates.length} Bahnhöfe — bitte auswählen.`
            : `${candidates.length} OSM-Treffer — bitte auswählen.`
        );
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
      const isTrain =
        (editingEventId === eventId
          ? eventForm.eventType
          : coerceTripEventType(event?.event_type || "")) === "Zugreisen";
      const res = await fetch(
        isTrain && candidate.stopRef
          ? `/api/trips/${tripId}/events/${eventId}/enrich-train`
          : `/api/trips/${tripId}/events/${eventId}/enrich-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isTrain && candidate.stopRef
              ? {
                  action: "apply-station",
                  target,
                  station: {
                    stopRef: candidate.stopRef,
                    name: candidate.name,
                    displayName: candidate.displayName,
                    lat: candidate.lat,
                    lon: candidate.lon,
                  },
                }
              : { candidate, target }
          ),
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
        isTrain && candidate.stopRef
          ? target === "origin"
            ? "Abfahrtsbahnhof gesetzt."
            : "Zielbahnhof gesetzt."
          : target === "origin"
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
    setEditFocusEventId(null);
    closeEventSheet();
    setDragEventId(null);
    setDragOverEventId(null);
  }

  function enterEditMode() {
    setEditMode(true);
    setEditFocusEventId((prev) => prev ?? events[0]?.id ?? null);
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

  async function deleteEventAttachment(eventId: number, attachmentId: number) {
    if (!window.confirm("PDF-Anhang löschen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/attachments?attachmentId=${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      await load();
      setStatus("PDF-Anhang gelöscht.");
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

  /** Schnelles Neu-generieren (ohne Prompt-Dialog), z. B. unter Preview / Zoom. */
  async function regenerateEventAiImage(eventId: number) {
    setAiImageBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/ai-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useSettings: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bildgenerierung fehlgeschlagen");
      await load();
      const url =
        typeof data.event?.ai_image_url === "string"
          ? data.event.ai_image_url
          : null;
      if (url) {
        setAiZoom((prev) =>
          prev && prev.eventId === eventId ? { ...prev, url } : prev
        );
      }
      setStatus("KI-Bild neu erzeugt.");
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
          title="TravelBuddy"
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

  const activeTab = parseTripDetailTab(searchParams.get("tab"));
  const tabItems: TripTabItem[] = [
    { id: "ablauf", label: "Ablauf", icon: LayoutList },
    { id: "finanzen", label: "Finanzen", icon: Wallet },
    { id: "reisende", label: "Reisende", icon: Users },
    { id: "dokumente", label: "Dokumente", icon: FileText },
  ];
  const overflowItems: AppTabOverflowItem[] = readOnly
    ? []
    : [
        {
          id: "neu",
          label: "Neuer Eintrag",
          icon: Plus,
          onSelect: () => setTab("neu"),
          active: activeTab === "neu",
        },
        {
          id: "mehr",
          label: "Extras & Bearbeiten",
          icon: MoreHorizontal,
          onSelect: () => setTab("mehr"),
          active: activeTab === "mehr",
        },
      ];

  function setTab(tab: TripDetailTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "ablauf") params.delete("tab");
    else params.set("tab", tab);
    const q = params.toString();
    router.replace(q ? `?${q}` : "?", { scroll: false });
  }

  const allDocuments = events.flatMap((event) => [
    ...(event.documents || []).map((doc) => ({
      kind: "paperless" as const,
      id: doc.id,
      paperless_id: doc.paperless_id,
      title: doc.title,
      url: null as string | null,
      eventId: event.id,
      eventTitle: event.title,
    })),
    ...(event.attachments || []).map((att) => ({
      kind: "local" as const,
      id: att.id,
      paperless_id: null as number | null,
      title: att.title || att.original_filename,
      url: att.url,
      eventId: event.id,
      eventTitle: event.title,
    })),
  ]);

  return (
    <div className={cn("space-y-6 pb-24 md:pb-0", editMode && !readOnly && "pb-36 md:pb-0")}>
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

      {todayAgenda ? (
        <TodayAgendaWidget
          iso={todayAgenda.iso}
          isToday={todayAgenda.isToday}
          events={todayAgenda.events}
          onSelectEvent={scrollToAgendaEvent}
        />
      ) : null}

      {(weather || missingChecklist.length > 0) &&
      (activeTab === "ablauf" || readOnly) ? (
        <SoftChipRow>
          {weather && weatherPoint ? (
            <SoftChip className="border-sky-500/25 bg-sky-50 text-sky-900">
              <span aria-hidden>{weatherConditionIcon(weather.weatherCode)}</span>
              <span className="font-semibold">{weatherPoint.label}</span>
              <span className="opacity-70">·</span>
              {Math.round(weather.temperatureC)} °C · {weather.weatherLabelDe}
            </SoftChip>
          ) : null}
          {missingChecklist.length > 0 ? (
            <SoftChip title="Optionale Hinweise zu noch fehlenden Bausteinen der Reise">
              Noch offen: {missingChecklist.join(" · ")}
            </SoftChip>
          ) : null}
        </SoftChipRow>
      ) : null}

      {activeTab === "ablauf" && routeMapPoints.length >= 2 && !readOnly ? (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <TripMap
            points={routeMapPoints}
            drawRoute
            routeStyle="straight"
            compact
            heightClassName="h-36 sm:h-44"
          />
        </div>
      ) : null}

      {!readOnly && activeTab !== "ablauf" ? (
        <div
          data-sticky-detail-chrome
          className={cn(
            stickyDetailChromeClass(stickyEnabled, {
              belowMobileHeader: stickyBelowHeader,
            }),
            "py-2"
          )}
        >
          <TripTabNav
            items={tabItems}
            active={activeTab}
            onChange={setTab}
            overflowItems={overflowItems}
          />
        </div>
      ) : null}

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

      {activeTab === "reisende" && !readOnly ? (
        <TripTravelersCard
          tripId={tripId}
          onCountChange={setTravelerCount}
        />
      ) : null}

      {activeTab === "finanzen" && !readOnly ? (
        <TripFinanceLedgerCard
          tripId={tripId}
          travelerCount={travelerCount}
        />
      ) : null}

      {activeTab === "mehr" ? (
        <div className="space-y-6">
      {!readOnly ? (
      <div className="flex flex-wrap gap-2">
        <TripExportMenu
          tripId={tripId}
          title={trip.title}
          destination={trip.destination}
          startDate={trip.start_date}
          endDate={trip.end_date}
          events={events.map((e) => ({
            id: e.id,
            title: e.title,
            event_type: e.event_type,
            start_date: e.start_date,
            start_time: e.start_time,
          }))}
          onStatus={setStatus}
          onError={setError}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={diaryBusy || events.length === 0}
          onClick={() => void openDiaryDialog()}
          className="gap-1.5"
        >
          <BookOpen className="size-4" />
          {diaryBusy ? "Sendet…" : "Reisetagebuch senden"}
        </Button>
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
            onClick={() => enterEditMode()}
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
            {trip.cover_url ? "Neu generieren" : "Mit AI erzeugen"}
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

        </div>
      ) : null}

      {activeTab === "neu" && !readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Neuen Eintrag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Aktivität ohne Beleg anlegen oder später Dokumente verknüpfen.
            </p>
            <Button className="w-full sm:w-auto" onClick={() => openNewEvent()}>
              <Plus className="mr-2 size-4" />
              Eintrag erstellen
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "dokumente" && !readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dokumente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Belege. Im Ablauf einen Eintrag wählen und PDF
                hochladen oder Paperless-Belege verknüpfen.
              </p>
            ) : (
              allDocuments.map((doc) => (
                <div
                  key={`${doc.kind}-${doc.eventId}-${doc.id}`}
                  className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2"
                >
                  <DocumentPdfThumb
                    paperlessId={doc.paperless_id ?? undefined}
                    pdfUrl={doc.url ?? undefined}
                    thumbUrl={doc.kind === "local" ? null : undefined}
                    title={doc.title}
                    size="square"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {doc.title || `Dokument #${doc.id}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {doc.eventTitle}
                      {doc.kind === "local" ? " · lokal" : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
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
                {eventForm.eventType === "Zugreisen" ? (
                  <div className="space-y-2 rounded-md border border-border/70 bg-background/80 p-2">
                    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`train-depart-after-${editingEventId}`}
                          className="text-xs"
                        >
                          Abfahrt ab
                        </Label>
                        <Input
                          id={`train-depart-after-${editingEventId}`}
                          type="time"
                          value={toTimeInputValue(eventForm.startTime)}
                          onChange={(e) =>
                            setEventForm((f) => ({
                              ...f,
                              startTime: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void enrichTrain(editingEventId)}
                        className="gap-1.5"
                      >
                        <TrainFront className="size-3.5" />
                        {busy ? "Sucht…" : "Verbindungen suchen"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Sucht Abfahrten ab dieser Zeit am gewählten Datum
                      (Europe/Zurich).
                    </p>
                  </div>
                ) : null}
                {error && eventForm.eventType === "Zugreisen" ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                    {error}
                  </div>
                ) : null}
                {status &&
                eventForm.eventType === "Zugreisen" &&
                /Verbindung/i.test(status) ? (
                  <div className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                    {status}
                  </div>
                ) : null}
                {(trainConnectionOptions[editingEventId] || []).length > 0 ? (
                  <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium">
                        Verbindung wählen (
                        {trainConnectionOptions[editingEventId].length})
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={busy}
                        onClick={() => {
                          const next = nextDepartAfterFromOptions(editingEventId);
                          if (!next) return;
                          void enrichTrain(editingEventId, {
                            departAfter: next,
                            append: true,
                          });
                        }}
                      >
                        Spätere laden
                      </Button>
                    </div>
                    <div className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
                      {trainConnectionOptions[editingEventId].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() =>
                            void applyTrainConnection(editingEventId, option)
                          }
                        >
                          <div className="font-medium">{option.label}</div>
                          <div className="text-muted-foreground">
                            {option.summary}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
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
                          {eventForm.eventType === "Zugreisen"
                            ? "Bahnhofssuche (ÖV-CH)"
                            : "OSM-Suche"}
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
                          placeholder={
                            eventForm.eventType === "Zugreisen"
                              ? "z. B. Zürich Flughafen, Altdorf"
                              : "Name + Stadt reicht oft (fuzzy Suche)"
                          }
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
                        {eventForm.eventType === "Zugreisen"
                          ? "Bahnhof suchen"
                          : "Ort suchen"}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {(placeCandidates[editingEventId] || []).length > 0 ? (
                  <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                    <div className="text-xs font-medium">
                      {eventForm.eventType === "Zugreisen"
                        ? "Bahnhof wählen"
                        : "OSM-Treffer wählen"}
                    </div>
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
                  PDF hochladen oder bestehendes Dokument verknüpfen.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => setLinkDocsEventId(editingEventId)}
                >
                  <FilePlus2 className="size-3.5" />
                  PDF / Belege
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

{activeTab === "ablauf" || readOnly ? (
      <div className="space-y-5">
        {stickyEnabled ? (
          <div
            data-sticky-detail-chrome
            className={cn(
              stickyDetailChromeClass(true, {
                belowMobileHeader: stickyBelowHeader,
              }),
              // Bleed into page padding so the sticky bar spans the scroll area cleanly.
              "-mx-4 space-y-2 px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
            )}
          >
            {!readOnly ? (
              <TripTabNav
                items={tabItems}
                active={activeTab}
                onChange={setTab}
                overflowItems={overflowItems}
              />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Timeline</h2>
            </div>
            {eventDayDates.length > 0 ? (
              <DateTimelineStrip
                dates={eventDayDates}
                anchorIdForDate={eventDayAnchorId}
                activeDate={activeEventDay}
                accent="travel"
              />
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-2 py-2">
              {!readOnly ? (
                <TripTabNav
                  items={tabItems}
                  active={activeTab}
                  onChange={setTab}
                  overflowItems={overflowItems}
                />
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Timeline</h2>
              </div>
            </div>
            {eventDayDates.length > 0 ? (
              <div
                className={cn(
                  stickyStripClass({
                    belowMobileHeader: stickyBelowHeader,
                    belowChrome: false,
                  }),
                  "py-1"
                )}
              >
                <DateTimelineStrip
                  dates={eventDayDates}
                  anchorIdForDate={eventDayAnchorId}
                  activeDate={activeEventDay}
                  accent="travel"
                />
              </div>
            ) : null}
          </>
        )}
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
              "gap-2.5"
            )}
          >
          {events.map((event, eventIndex) => {
            const visual = eventVisual(event.event_type);
            const dayIso = parseEventIsoDate(event.start_date);
            const isDayAnchor = firstOfDayEventIds.has(event.id);
            const dayAnchorId =
              isDayAnchor && dayIso ? `event-day-${dayIso}` : undefined;
            const dayAnchorClass = isDayAnchor
              ? "scroll-mt-36 lg:scroll-mt-48"
              : undefined;
            const nextEvent = events[eventIndex + 1];
            const isLastOfDay =
              !nextEvent || firstOfDayEventIds.has(nextEvent.id);
            const dateLine = formatEventDateLine(event);
            {
              const details = formatCompactDetailLine(event);
              return (
                <div
                  key={event.id}
                  id={dayAnchorId}
                  data-event-id={event.id}
                  className={dayAnchorClass}
                >
                  {isDayAnchor && dayIso ? (
                    <EventDayHeading iso={dayIso} />
                  ) : null}
                  <div
                    className={cn(
                      "flex gap-2 pt-1",
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
                  <EventTimelineRail
                    event={event}
                    showConnector={!isLastOfDay}
                  />
                  <div className="min-w-0 flex-1 pb-2">
                  <Card
                    className={cn(
                      "relative gap-0 overflow-hidden border border-border bg-card py-0 shadow-none transition-shadow",
                      detailEventId === event.id &&
                        "ring-2 ring-[var(--brand-docs)]/30",
                      editMode &&
                        dragOverEventId === event.id &&
                        "ring-2 ring-teal-400/50",
                      !editMode && "cursor-pointer hover:bg-muted/20"
                    )}
                    onClick={() => {
                      if (!editMode) {
                        setDetailSlide("overview");
                        setDetailEventId(event.id);
                      }
                    }}
                  >
                    <CardContent className="space-y-2 p-2.5 sm:p-3">
                      <div className="flex items-start gap-2.5">
                        <IconCircle
                          icon={visual.icon}
                          tone="green"
                          shape="rounded"
                          size="md"
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="min-w-0 flex-1 text-sm font-black leading-snug tracking-tight line-clamp-2 md:truncate sm:text-base">
                            {event.title}
                          </div>
                          {editMode ? (
                            <button
                              type="button"
                              draggable
                              title="Ziehen zum Sortieren"
                              className="hidden cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing sm:inline-flex"
                              onClick={(e) => e.stopPropagation()}
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
                        </div>
                        {dateLine ? (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Calendar className="size-3 shrink-0" />
                            <span className="truncate">{dateLine}</span>
                          </div>
                        ) : null}
                        {/* PWA/mobile: comment pill under title/date */}
                        <div className="mt-1.5 md:hidden">
                          <CommentCountChip
                            count={event.comment_count || 0}
                            showWhenEmpty={!readOnly}
                            onClick={() => {
                              setDetailSlide("diary");
                              setDetailEventId(event.id);
                            }}
                            className="border-[var(--brand-docs)]/25 bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]"
                          />
                        </div>
                        {details ? (
                          <div className="mt-0.5 hidden line-clamp-2 text-xs text-muted-foreground md:block">
                            {details}
                          </div>
                        ) : null}
                        {(event.linked_expenses?.length || 0) > 0 ? (
                          <div
                            className="mt-1.5 hidden md:block"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <EventLinkedExpenses
                              expenses={event.linked_expenses || []}
                              hideAmount={eventDenseFacts(event).length > 0}
                            />
                          </div>
                        ) : null}
                        </div>
                        <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
                          <EventStatusPill event={event} />
                          <EventDenseFactsColumn
                            event={event}
                            size="sm"
                            onOpenComments={() => {
                              setDetailSlide("diary");
                              setDetailEventId(event.id);
                            }}
                          />
                        </div>
                        <div
                          className="hidden self-stretch w-px bg-border sm:block"
                          aria-hidden
                        />
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <EventCardAiImage
                            event={event}
                            onOpen={() =>
                              setAiZoom({
                                url: event.ai_image_url!,
                                title: event.title,
                                eventId: event.id,
                              })
                            }
                          />
                        </div>
                      </div>

                      {getEventMapModel(event) ? (
                        <div
                          className="overflow-hidden rounded-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <EventMapSnippet
                            event={event}
                            heightClassName="h-28 sm:h-32"
                            compact
                          />
                        </div>
                      ) : null}

                      {editMode ? (
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant={
                              editFocusEventId === event.id
                                ? "secondary"
                                : "ghost"
                            }
                            className="h-7 shrink-0 px-2 text-xs md:hidden"
                            onClick={() => setEditFocusEventId(event.id)}
                          >
                            {editFocusEventId === event.id ? "Aktiv" : "Wählen"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hidden h-7 shrink-0 px-2 text-xs md:inline-flex"
                            onClick={() => startEditEvent(event)}
                          >
                            <Pencil className="mr-1 size-3.5" />
                            Ändern
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  </div>
                  </div>
                </div>
              );
            }
          })
          }
          </div>
        )}
      </div>
      ) : null}


      <EventDetailOverlay
        open={detailEventId != null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailEventId(null);
            setDetailSlide("overview");
          }
        }}
        event={
          detailEventId != null
            ? events.find((e) => e.id === detailEventId) || null
            : null
        }
        tripId={tripId}
        readOnly={readOnly}
        shareToken={shareToken}
        editMode={editMode}
        busy={busy}
        aiImageBusy={aiImageBusy || aiBatch != null}
        initialSlide={detailSlide}
        onEdit={(ev) => {
          setDetailEventId(null);
          setDetailSlide("overview");
          startEditEvent(ev as TripEvent);
        }}
        onLinkDocs={(id) => setLinkDocsEventId(id)}
        onAiImage={(ev) => openAiImageDialog(ev as TripEvent)}
        onDelete={(id) => void removeEvent(id)}
        onUnlinkDoc={(eventId, documentId) =>
          void unlinkEventDocument(eventId, documentId)
        }
        onDeleteAttachment={(eventId, attachmentId) =>
          void deleteEventAttachment(eventId, attachmentId)
        }
        onToggleShowDocumentNotes={(eventId, show) =>
          void toggleShowDocumentNotes(eventId, show)
        }
        onOpenAiZoom={(payload) => setAiZoom(payload)}
        onCommentCountChange={(eventId, count) => {
          setEvents((prev) =>
            prev.map((e) =>
              e.id === eventId ? { ...e, comment_count: count } : e
            )
          );
        }}
      />

      <Dialog open={diaryOpen} onOpenChange={setDiaryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reisetagebuch per Mail</DialogTitle>
            <DialogDescription>
              {trip.title} — wähle die Reiseteilnehmer, die das Tagebuch
              (Aktivitäten, Kommentare, Ausgaben) erhalten sollen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 pb-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                setDiarySelected(diaryRecipients.map((r) => r.recipientKey))
              }
            >
              Alle
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setDiarySelected([])}
            >
              Keine
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {diarySelected.length} / {diaryRecipients.length}
            </span>
          </div>
          <div className="max-h-[min(50dvh,22rem)] space-y-2 overflow-y-auto py-1">
            <p className="text-sm font-medium">Reiseteilnehmer</p>
            {diaryRecipients.map((r) => {
              const checked = diarySelected.includes(r.recipientKey);
              return (
                <label
                  key={r.recipientKey}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-sm hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setDiarySelected((prev) =>
                        checked
                          ? prev.filter((id) => id !== r.recipientKey)
                          : [...prev, r.recipientKey]
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.email}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={diaryBusy}
              onClick={() => setDiaryOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              disabled={diaryBusy || diarySelected.length === 0}
              onClick={() => void sendDiaryMail()}
              className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
            >
              {diaryBusy
                ? "Sendet…"
                : `Senden (${diarySelected.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full gap-1.5 sm:w-auto"
                disabled={aiImageBusy || aiBatch != null}
                onClick={() => void regenerateEventAiImage(aiZoom.eventId!)}
              >
                <RefreshCw
                  className={cn("size-4", aiImageBusy && "animate-spin")}
                />
                {aiImageBusy ? "Generiert…" : "Neu generieren"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-1.5 sm:w-auto"
                onClick={() => void downloadEventAiImage(aiZoom.eventId!)}
              >
                <Download className="size-4" />
                Herunterladen
              </Button>
              {editMode ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-1.5 sm:w-auto"
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
              {aiImageBusy
                ? "Generiert…"
                : aiImageEventId != null &&
                    events.some(
                      (e) => e.id === aiImageEventId && e.ai_image_url
                    )
                  ? "Neu generieren"
                  : "Bild erzeugen"}
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

      {editMode && !readOnly && activeTab === "ablauf" ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4.25rem] z-40 md:hidden">
          <div className="pointer-events-auto border-t border-border/80 bg-background/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur">
            {(() => {
              const focus =
                events.find((e) => e.id === editFocusEventId) || events[0];
              if (!focus) {
                return (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => openNewEvent()}
                    >
                      <Plus className="mr-1 size-4" />
                      Neuer Eintrag
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exitEditMode()}
                    >
                      Ansicht
                    </Button>
                  </div>
                );
              }
              const focusIdx = events.findIndex((e) => e.id === focus.id);
              return (
                <div className="space-y-1.5">
                  <p className="truncate px-1 text-[11px] text-muted-foreground">
                    {focus.title}
                  </p>
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      disabled={busy || focusIdx <= 0}
                      title="Nach oben"
                      onClick={() => moveEvent(focus.id, -1)}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      disabled={
                        busy || focusIdx < 0 || focusIdx >= events.length - 1
                      }
                      title="Nach unten"
                      onClick={() => moveEvent(focus.id, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => startEditEvent(focus)}
                    >
                      <Pencil className="mr-1 size-3.5" />
                      Ändern
                    </Button>
                    <EventActionsMenu
                      triggerSize="icon-sm"
                      triggerVariant="outline"
                      triggerClassName="shrink-0"
                      items={[
                        {
                          label: "Beleg / PDF",
                          icon: FilePlus2,
                          disabled: busy,
                          onClick: () => setLinkDocsEventId(focus.id),
                        },
                        {
                          label: "KI-Bild",
                          icon: ImagePlus,
                          disabled: busy || aiImageBusy,
                          onClick: () => openAiImageDialog(focus),
                        },
                        {
                          label: "Löschen",
                          icon: Trash2,
                          variant: "destructive",
                          onClick: () => void removeEvent(focus.id),
                        },
                      ]}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="ml-auto shrink-0"
                      onClick={() => openNewEvent()}
                    >
                      <Plus className="mr-1 size-3.5" />
                      Neu
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => exitEditMode()}
                    >
                      Fertig
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {!readOnly && !editMode ? (
        <SpeedDialFab
          accent="travel"
          actions={[
            {
              id: "flug",
              label: "Flug",
              icon: Plane,
              onSelect: () => openNewEvent("Flug"),
            },
            {
              id: "hotel",
              label: "Hotel",
              icon: BedDouble,
              onSelect: () => openNewEvent("Hotel"),
            },
            {
              id: "aktivitaet",
              label: "Aktivität",
              icon: Ticket,
              onSelect: () => openNewEvent("Ausflug"),
            },
            {
              id: "finanzen",
              label: "Finanzen",
              icon: Wallet,
              onSelect: () => setTab("finanzen"),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
