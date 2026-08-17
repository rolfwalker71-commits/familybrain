"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Calendar,
  CalendarPlus,
  ChevronDown,
  Clock3,
  Flag,
  Inbox,
  Lock,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/layout/page-primitives";
import { MaringoLogo } from "@/components/branding/provider-logos";
import { pageVisuals } from "@/components/layout/icon-circle";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  ALL_STATUS_IDS,
  STATUS_LABELS,
  WORK_STATUS_IDS,
  statusChipClass,
  statusChipLabel,
  statusDetailHeaderClass,
} from "@/lib/mari/status";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";
import type { MariTicketAnalysis } from "@/lib/mari/analyze-ticket";
import type { AiTokenUsage } from "@/lib/ai/usage-cost";
import { formatTokenUsageBreakdownLines } from "@/lib/ai/usage-cost";
import type {
  MariEmployeeOption,
  MariTicketDetail,
  MariTicketListItem,
  MariTimelineAttachment,
  MariTimelineItem,
} from "@/lib/mari/tickets";
import type { MariCustomerOption } from "@/lib/mari/customers";
import type {
  MariListMetaField,
  MariListSort,
  MariTicketFilterMode,
  MariTimelineSort,
} from "@/lib/mari/ticket-filter-prefs-shared";
import {
  DEFAULT_MARI_LIST_META_FIELDS,
  MARI_LIST_META_FIELD_OPTIONS,
  parseMariTicketFilterPrefsPatch,
  readMariTicketFilterPrefsLocal,
  writeMariTicketFilterPrefsLocal,
  type MariTicketFilterPrefsPatch,
} from "@/lib/mari/ticket-filter-prefs-shared";
import { buildMariTicketListMetaItems } from "@/lib/mari/ticket-list-meta";
import { MariCustomerChip } from "@/components/maringo/mari-customer-chip";
import {
  MariMainFlyoutShell,
  MariSecondaryFlyoutShell,
  MariTicketFlyoutRail,
  MARI_FLYOUT_MS,
  MARI_SECONDARY_FLYOUT_META,
  toggleMariSecondaryFlyout,
  useFlyoutPresence,
  useFlyoutStackPresence,
  type MariSecondaryFlyoutId,
} from "@/components/maringo/maringo-flyout-chrome";
import {
  timelineSideLabel,
  isMariMailStubText,
  type MariTimelineSide,
} from "@/lib/mari/timeline-side";
import {
  detectReplyLanguage,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";
import type { MariTimeLine } from "@/lib/mari/timekeeping-shared";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";
import { MaringoTimekeepingPanel } from "@/components/maringo/maringo-timekeeping-panel";
import { MaringoTimeBookDialog } from "@/components/maringo/maringo-time-book-dialog";
import { MaringoTicketKopfForm } from "@/components/maringo/maringo-ticket-kopf-form";
import type { TimeBookFormDefaults } from "@/components/maringo/maringo-time-book-form";
import { AdhocEventDialog } from "@/components/calendar/adhoc-event-dialog";
import type { MariCalendarStamp } from "@/lib/mari/calendar-stamp";
import {
  MaringoTimeSuggestionsPanel,
  suggestionToBookDefaults,
  type MariTimeSuggestion,
} from "@/components/maringo/maringo-time-suggestions-panel";

function ReplyLangToggle({
  lang,
  busy,
  onChange,
}: {
  lang: ReplyLang;
  busy: boolean;
  onChange: (lang: ReplyLang) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border/60 p-0.5"
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {(["de", "en"] as const).map((code) => (
        <Button
          key={code}
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
            lang === code
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(code);
          }}
        >
          {code}
        </Button>
      ))}
    </div>
  );
}

function sideChipClass(side: MariTimelineSide): string {
  switch (side) {
    case "support":
      return "border-sky-200 bg-sky-100/80 text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/20 dark:text-sky-100";
    case "customer":
      return "border-teal-200 bg-teal-100/80 text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/20 dark:text-teal-100";
    case "system":
      // Slate/navy — nicht Sky (Support) und nicht Teal (Kunde)
      return "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-400/30 dark:bg-slate-500/20 dark:text-slate-100";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function attachmentUrl(attachmentId: number, download = false): string {
  const q = download ? "?download=1" : "";
  return `/api/maringo/attachments/${attachmentId}${q}`;
}

function TimelineImageThumb({
  attachment,
  onOpen,
}: {
  attachment: MariTimelineAttachment;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(attachmentUrl(attachment.attachmentId), {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.size < 32) throw new Error("empty");
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.attachmentId]);

  if (failed) {
    return (
      <a
        href={attachmentUrl(attachment.attachmentId, true)}
        className="inline-flex h-24 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 bg-muted/30 px-2 text-center text-[10px] text-muted-foreground hover:border-orange-300 hover:text-foreground"
        title={`${attachment.orgFilename} herunterladen`}
      >
        <Paperclip className="size-3.5" />
        <span className="line-clamp-2 w-full break-all">
          {attachment.orgFilename}
        </span>
      </a>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="group relative h-auto overflow-hidden rounded-lg border border-border/60 bg-background p-0 shadow-sm transition hover:border-orange-300"
      onClick={onOpen}
      title={attachment.orgFilename}
      disabled={!src}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.orgFilename}
          className="h-24 w-auto max-w-[11rem] object-cover"
        />
      ) : (
        <span className="flex h-24 w-28 items-center justify-center text-[10px] text-muted-foreground">
          Lädt…
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
        {attachment.orgFilename}
      </span>
    </Button>
  );
}

function TimelineAttachments({
  attachments,
}: {
  attachments: MariTimelineAttachment[];
}) {
  const [lightbox, setLightbox] = useState<MariTimelineAttachment | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const images = attachments.filter((a) => a.isImage);
  const files = attachments.filter((a) => !a.isImage);

  useEffect(() => {
    if (!lightbox) {
      setLightboxSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const res = await fetch(attachmentUrl(lightbox.attachmentId), {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setLightboxSrc(objectUrl);
      } catch {
        if (!cancelled) setLightboxSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lightbox]);

  return (
    <>
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {images.map((a) => (
            <TimelineImageThumb
              key={a.attachmentId}
              attachment={a}
              onOpen={() => setLightbox(a)}
            />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 pt-0.5">
          {files.map((a) => (
            <li key={a.attachmentId}>
              <a
                href={attachmentUrl(a.attachmentId, true)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:border-orange-300 hover:bg-orange-50/50 dark:hover:border-orange-400/40 dark:hover:bg-orange-500/10"
                title={a.orgFilename}
              >
                <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.orgFilename}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {lightbox ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.orgFilename}
          onClick={() => setLightbox(null)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 size-9 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => setLightbox(null)}
            aria-label="Schliessen"
          >
            <X className="size-5" />
          </Button>
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightboxSrc}
                alt={lightbox.orgFilename}
                className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
              />
            ) : (
              <p className="rounded-lg bg-white/90 px-4 py-3 text-sm text-foreground">
                Bild wird geladen…
              </p>
            )}
            <a
              href={attachmentUrl(lightbox.attachmentId, true)}
              className="rounded-full bg-white/90 px-3 py-1 text-[12px] font-medium text-foreground hover:bg-white"
            >
              {lightbox.orgFilename} herunterladen
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatTimelineAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatDateTimeShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return formatTimelineAt(iso);
}

function formatDateShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const swiss = toSwissDate(iso);
  return swiss === "–" ? null : swiss;
}

/** Nur Tag.Monat für kompakte Listenzeilen */
function formatDayMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const swiss = toSwissDate(iso);
  if (swiss === "–") return null;
  const parts = swiss.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return swiss;
}

function formatStampWhen(stamp: {
  eventDate: string;
  startHm: string | null;
}): string {
  const day =
    formatDayMonth(stamp.eventDate) ||
    formatDateShort(stamp.eventDate) ||
    stamp.eventDate;
  const hm = stamp.startHm?.slice(0, 5) || null;
  return hm ? `${day} ${hm}` : day;
}

function zurichTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function primaryContact(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.split(";")[0]?.trim() || null;
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function joinMeta(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map((p) => p?.trim()).filter(Boolean) as string[];
  return cleaned.length ? cleaned.join(" · ") : null;
}

function StatusChip({
  status,
  statusName,
  className,
}: {
  status: number;
  statusName?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 shrink-0 rounded-full px-2 text-[10px] font-semibold",
        statusChipClass(status),
        className
      )}
    >
      {statusChipLabel(status, statusName)}
    </Badge>
  );
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="truncate text-[12px] font-semibold leading-snug">
        {children}
      </div>
    </div>
  );
}

function TimelineRow({
  item,
  onDeleteInternalNote,
  deletingAttachmentId,
}: {
  item: MariTimelineItem;
  onDeleteInternalNote?: (attachmentId: number) => void;
  deletingAttachmentId?: number | null;
}) {
  const side = item.side || "unknown";

  if (item.kind === "change") {
    return (
      <li className="relative pl-8">
        <span className="absolute left-[0.55rem] top-2 size-2.5 rounded-full bg-slate-600 ring-4 ring-background" />
        <div className="inline-flex max-w-full flex-col rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-slate-900 dark:border-slate-400/30 dark:bg-slate-500/15 dark:text-slate-100">
          <span className="text-[11px] font-medium leading-tight text-slate-600 dark:text-slate-300">
            {formatTimelineAt(item.at)}
          </span>
          <span className="text-[12px] font-medium leading-snug">
            {item.text}
          </span>
        </div>
      </li>
    );
  }

  const attachments = item.attachments || [];
  const hasAttachments = attachments.length > 0;
  const isAttachmentOnly =
    item.kind === "attachment" ||
    (hasAttachments && isMariMailStubText(item.text));
  const showBody =
    Boolean(item.text?.trim() || item.html?.trim()) &&
    !(isAttachmentOnly && isMariMailStubText(item.text));
  const fromSupport = side === "support";
  const deletableId = item.deletableAttachmentId ?? null;
  const deleting =
    deletableId != null && deletingAttachmentId === deletableId;
  const bubble =
    side === "support"
      ? "ml-auto border-sky-200/80 bg-sky-50 text-sky-950 dark:border-sky-400/25 dark:bg-sky-500/12 dark:text-sky-100"
      : side === "system"
        ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-400/25 dark:bg-slate-500/12 dark:text-slate-100"
        : side === "customer"
          ? "border-teal-200/70 bg-teal-50/50 text-teal-950 dark:border-teal-400/25 dark:bg-teal-500/10 dark:text-teal-50"
          : "border-border/70 bg-muted/40 text-foreground";
  const dot =
    side === "support"
      ? "bg-sky-500"
      : side === "customer"
        ? "bg-teal-600"
        : side === "system"
          ? "bg-slate-600"
          : "bg-muted-foreground";

  return (
    <li className="relative pl-8">
      <span
        className={cn(
          "absolute left-[0.45rem] top-3 size-3 rounded-full ring-4 ring-background",
          dot
        )}
      />
      <div
        className={cn("max-w-[92%] space-y-1", fromSupport && "ml-auto")}
      >
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal",
              sideChipClass(side)
            )}
          >
            {timelineSideLabel(side)}
          </span>
          <span>
            {formatTimelineAt(item.at)} · {item.label}
            {item.actor ? ` · ${item.actor}` : ""}
            {item.meta ? ` · ${item.meta}` : ""}
          </span>
          {deletableId != null && onDeleteInternalNote ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
              disabled={deleting}
              title="Internen Kommentar löschen"
              onClick={() => onDeleteInternalNote(deletableId)}
            >
              <Trash2 className="size-3" />
              {deleting ? "Lösche…" : "Löschen"}
            </Button>
          ) : null}
        </p>
        {item.subject ? (
          <p className="text-[12px] font-medium text-foreground/80">
            {item.subject}
          </p>
        ) : null}
        <div
          className={cn(
            "space-y-2 rounded-md border px-3.5 py-2.5 text-[13px] leading-relaxed",
            bubble
          )}
        >
          {showBody ? (
            item.html ? (
              <div
                className="mari-note-html max-w-none overflow-x-auto text-[13px] leading-relaxed [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_pre]:whitespace-pre-wrap [&_pre]:font-mono [&_pre]:text-[11px]"
                dangerouslySetInnerHTML={{ __html: item.html }}
              />
            ) : (
              <div className="whitespace-pre-wrap">{item.text}</div>
            )
          ) : null}
          {isAttachmentOnly && hasAttachments ? (
            <p className="text-[11px] text-muted-foreground">
              {attachments.length === 1
                ? "Anhang aus E-Mail / Ticket"
                : `${attachments.length} Anhänge aus E-Mail / Ticket`}
            </p>
          ) : null}
          {hasAttachments ? (
            <TimelineAttachments attachments={attachments} />
          ) : null}
          {!showBody && !hasAttachments ? (
            <span className="text-muted-foreground">(kein Text)</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function MaringoWorkspaceClient() {
  const searchParams = useSearchParams();
  const [workspaceTab, setWorkspaceTab] = useState<"tickets" | "hours">(
    "tickets"
  );
  const [statuses, setStatuses] = useState<number[]>([...WORK_STATUS_IDS]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filterReady, setFilterReady] = useState(false);
  /** Skip auto-PUT right after hydrate so defaults never overwrite saved prefs. */
  const skipFilterPrefsSaveRef = useRef(true);
  const [timelineSort, setTimelineSort] =
    useState<MariTimelineSort>("oldest");
  const [listSort, setListSort] = useState<MariListSort>("newest");
  const [listMetaFields, setListMetaFields] = useState<MariListMetaField[]>([
    ...DEFAULT_MARI_LIST_META_FIELDS,
  ]);
  const [tickets, setTickets] = useState<MariTicketListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ticketFlyoutOpen, setTicketFlyoutOpen] = useState(false);
  const [secondaryFlyouts, setSecondaryFlyouts] = useState<
    MariSecondaryFlyoutId[]
  >([]);
  const [flyoutPortalReady, setFlyoutPortalReady] = useState(false);
  const ticketFlyoutWanted = ticketFlyoutOpen && selectedId != null;
  const ticketFlyoutPresence = useFlyoutPresence(ticketFlyoutWanted);
  const secondaryPresence = useFlyoutStackPresence(secondaryFlyouts);
  const [detail, setDetail] = useState<MariTicketDetail | null>(null);
  const [analysis, setAnalysis] = useState<MariTicketAnalysis | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [savedAnalyzedAt, setSavedAnalyzedAt] = useState<string | null>(null);
  const [analysisInternalNotePostedAt, setAnalysisInternalNotePostedAt] =
    useState<string | null>(null);
  const [imagesAnalyzed, setImagesAnalyzed] = useState(0);
  const [imageNames, setImageNames] = useState<string[]>([]);
  const [analysisUsage, setAnalysisUsage] = useState<AiTokenUsage | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [postingInternalNote, setPostingInternalNote] = useState(false);
  const [translatingReplyDraft, setTranslatingReplyDraft] = useState(false);
  const [replyDraftLang, setReplyDraftLang] = useState<ReplyLang | null>(null);
  const [manualNoteDraft, setManualNoteDraft] = useState("");
  const [postingManualNote, setPostingManualNote] = useState(false);
  const [manualNoteHint, setManualNoteHint] = useState<string | null>(null);
  const [externalNoteDraft, setExternalNoteDraft] = useState("");
  const [postingExternalNote, setPostingExternalNote] = useState(false);
  const [draftingExternalNote, setDraftingExternalNote] = useState(false);
  const [externalNoteHint, setExternalNoteHint] = useState<string | null>(
    null
  );
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    number | null
  >(null);
  const [patching, setPatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [dueDraft, setDueDraft] = useState("");
  const [employees, setEmployees] = useState<MariEmployeeOption[]>([]);
  const [defaultHandledBy, setDefaultHandledBy] = useState("");
  const [handledBy, setHandledBy] = useState("");
  const [manualHandledBy, setManualHandledBy] = useState("");
  const [handlerMode, setHandlerMode] = useState<"list" | "manual">("list");
  const [filterMode, setFilterMode] =
    useState<MariTicketFilterMode>("handler");
  const [selectedCustomers, setSelectedCustomers] = useState<
    MariCustomerOption[]
  >([]);
  const [customerDraft, setCustomerDraft] = useState<MariCustomerOption[]>(
    []
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<MariCustomerOption[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [editBookLineId, setEditBookLineId] = useState<number | null>(null);
  const [editBookDefaults, setEditBookDefaults] =
    useState<TimeBookFormDefaults | null>(null);
  const [ticketCalendarOpen, setTicketCalendarOpen] = useState(false);
  const [ticketCalendarStamp, setTicketCalendarStamp] =
    useState<MariCalendarStamp | null>(null);
  const [listCalendarStamps, setListCalendarStamps] = useState<
    Record<number, MariCalendarStamp>
  >({});
  const [pendingStampBook, setPendingStampBook] =
    useState<MariTimeSuggestion | null>(null);
  const [suggestionsRefresh, setSuggestionsRefresh] = useState(0);
  const [busyTicketLineId, setBusyTicketLineId] = useState<number | null>(null);
  const [ticketTimeLines, setTicketTimeLines] = useState<MariTimeLine[]>([]);
  const [ticketTimeLoading, setTicketTimeLoading] = useState(false);

  const statusParam = useMemo(() => statuses.join(","), [statuses]);
  const analysisUsageLines = useMemo(
    () => formatTokenUsageBreakdownLines(analysisUsage),
    [analysisUsage]
  );
  const nextReplyDraftLang = useMemo((): ReplyLang => {
    if (replyDraftLang) return replyDraftLang;
    const draft = analysis?.nextReplyDraft?.trim() || "";
    return detectReplyLanguage(draft);
  }, [analysis?.nextReplyDraft, replyDraftLang]);

  const detailImageAttachmentCount = useMemo(() => {
    if (!detail?.timeline) return 0;
    let n = 0;
    for (const item of detail.timeline) {
      for (const a of item.attachments || []) {
        if (a.isImage) n += 1;
      }
    }
    return n;
  }, [detail]);

  const sortedTimeline = useMemo(() => {
    if (!detail?.timeline?.length) return [];
    const items = [...detail.timeline];
    items.sort((a, b) => {
      const ta = Date.parse(a.at) || 0;
      const tb = Date.parse(b.at) || 0;
      if (ta !== tb) {
        return timelineSort === "newest" ? tb - ta : ta - tb;
      }
      return timelineSort === "newest"
        ? b.id.localeCompare(a.id)
        : a.id.localeCompare(b.id);
    });
    return items;
  }, [detail?.timeline, timelineSort]);

  const sortedTickets = useMemo(() => {
    if (tickets.length === 0) return tickets;
    const items = [...tickets];
    const stamp = (t: MariTicketListItem) =>
      Date.parse(t.requestDate || "") ||
      Date.parse(t.changeAtDate || "") ||
      0;
    items.sort((a, b) => {
      const ta = stamp(a);
      const tb = stamp(b);
      if (ta !== tb) {
        return listSort === "newest" ? tb - ta : ta - tb;
      }
      return listSort === "newest"
        ? b.issueId - a.issueId
        : a.issueId - b.issueId;
    });
    return items;
  }, [tickets, listSort]);

  const ticketTimeHoursTotal = useMemo(() => {
    return (
      Math.round(
        ticketTimeLines.reduce((s, l) => s + l.hours, 0) * 100
      ) / 100
    );
  }, [ticketTimeLines]);

  const effectiveHandledBy = useMemo(() => {
    if (handlerMode === "manual") {
      return manualHandledBy.trim().toUpperCase();
    }
    return (handledBy || defaultHandledBy).trim().toUpperCase();
  }, [handlerMode, manualHandledBy, handledBy, defaultHandledBy]);

  const [listHandledBy, setListHandledBy] = useState("");
  useEffect(() => {
    if (handlerMode !== "manual") {
      setListHandledBy(effectiveHandledBy);
      return;
    }
    const t = window.setTimeout(() => {
      setListHandledBy(effectiveHandledBy);
    }, 450);
    return () => window.clearTimeout(t);
  }, [handlerMode, effectiveHandledBy]);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/maringo/employees");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = Array.isArray(data.employees)
        ? (data.employees as MariEmployeeOption[])
        : [];
      setEmployees(list);
      const def = String(data.defaultEmployeeNumber || "")
        .trim()
        .toUpperCase();
      if (def) {
        setDefaultHandledBy(def);
        setHandledBy((prev) => prev || def);
      }
    } catch {
      /* optional — manuelle Eingabe bleibt möglich */
    }
  }, []);

  const selectedCardCodesKey = useMemo(
    () =>
      selectedCustomers
        .map((c) => c.cardCode)
        .sort()
        .join(","),
    [selectedCustomers]
  );

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    const applyStamps = (raw: unknown) => {
      if (!raw || typeof raw !== "object") {
        setListCalendarStamps({});
        return;
      }
      const next: Record<number, MariCalendarStamp> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const id = Number(k);
        if (Number.isInteger(id) && v && typeof v === "object") {
          next[id] = v as MariCalendarStamp;
        }
      }
      setListCalendarStamps(next);
    };
    try {
      if (filterMode === "customer") {
        if (!selectedCardCodesKey) {
          setConfigured(true);
          setTickets([]);
          setListCalendarStamps({});
          return;
        }
        const q = new URLSearchParams();
        if (statusParam) q.set("status", statusParam);
        if (overdueOnly) q.set("overdue", "1");
        q.set("cardCodes", selectedCardCodesKey);
        const res = await fetch(`/api/maringo/tickets?${q}`);
        const data = await res.json().catch(() => ({}));
        if (res.status === 503) {
          setConfigured(false);
          setTickets([]);
          setListCalendarStamps({});
          setError(data.error || "MARI nicht konfiguriert.");
          return;
        }
        setConfigured(true);
        if (!res.ok) throw new Error(data.error || "Liste fehlgeschlagen");
        setTickets(Array.isArray(data.tickets) ? data.tickets : []);
        applyStamps(data.calendarStamps);
        if (typeof data.defaultHandledBy === "string" && data.defaultHandledBy) {
          setDefaultHandledBy(String(data.defaultHandledBy).toUpperCase());
        }
        return;
      }

      const q = new URLSearchParams();
      if (statusParam) q.set("status", statusParam);
      if (overdueOnly) q.set("overdue", "1");
      if (listHandledBy) q.set("handledBy", listHandledBy);
      const res = await fetch(`/api/maringo/tickets?${q}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setConfigured(false);
        setTickets([]);
        setListCalendarStamps({});
        setError(data.error || "MARI nicht konfiguriert.");
        return;
      }
      setConfigured(true);
      if (!res.ok) throw new Error(data.error || "Liste fehlgeschlagen");
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      applyStamps(data.calendarStamps);
      if (typeof data.defaultHandledBy === "string" && data.defaultHandledBy) {
        setDefaultHandledBy(String(data.defaultHandledBy).toUpperCase());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTickets([]);
      setListCalendarStamps({});
    } finally {
      setListLoading(false);
    }
  }, [
    statusParam,
    overdueOnly,
    listHandledBy,
    filterMode,
    selectedCardCodesKey,
  ]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setAnalysis(null);
    setAnalysisOpen(false);
    setSavedAnalyzedAt(null);
    setAnalysisInternalNotePostedAt(null);
    setImagesAnalyzed(0);
    setImageNames([]);
    setAnalysisUsage(null);
    setReplyDraftLang(null);
    setTranslatingReplyDraft(false);
    setManualNoteDraft("");
    setManualNoteHint(null);
    setPostingManualNote(false);
    setExternalNoteDraft("");
    setExternalNoteHint(null);
    setPostingExternalNote(false);
    setDraftingExternalNote(false);
    setTicketCalendarStamp(null);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Detail fehlgeschlagen");
      const ticket = data.ticket as MariTicketDetail;
      setDetail(ticket);
      setTicketCalendarStamp(
        data.calendarStamp && typeof data.calendarStamp === "object"
          ? (data.calendarStamp as MariCalendarStamp)
          : null
      );
      const due = ticket?.dueDate;
      if (due) {
        setDueDraft(due.slice(0, 10));
      } else {
        const today = zurichTodayYmd();
        setDueDraft(today);
        try {
          const patchRes = await fetch(`/api/maringo/tickets/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dueDate: today }),
          });
          const patchData = await patchRes.json().catch(() => ({}));
          if (patchRes.ok && patchData.ticket) {
            setDetail(patchData.ticket as MariTicketDetail);
            void loadList();
          }
        } catch {
          /* Stichtag-Vorbelegung optional */
        }
      }

      const storedRes = await fetch(`/api/maringo/tickets/${id}/analyze`);
      const storedData = await storedRes.json().catch(() => ({}));
      if (storedRes.ok && storedData.stored && storedData.analysis) {
        setAnalysis(storedData.analysis as MariTicketAnalysis);
        setSavedAnalyzedAt(
          typeof storedData.analyzedAt === "string"
            ? storedData.analyzedAt
            : null
        );
        setImagesAnalyzed(Number(storedData.imagesAnalyzed) || 0);
        setImageNames(
          Array.isArray(storedData.imageNames)
            ? storedData.imageNames.map((n: unknown) => String(n))
            : []
        );
        setAnalysisUsage(
          storedData.usage && typeof storedData.usage === "object"
            ? (storedData.usage as AiTokenUsage)
            : null
        );
        setAnalysisInternalNotePostedAt(
          typeof storedData.internalNotePostedAt === "string"
            ? storedData.internalNotePostedAt
            : null
        );
        setAnalysisOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDetail(null);
      setTicketCalendarStamp(null);
    } finally {
      setDetailLoading(false);
    }
  }, [loadList]);

  const loadTicketTimeLines = useCallback(async (id: number) => {
    setTicketTimeLoading(true);
    try {
      const res = await fetch(
        `/api/maringo/timekeeping/by-ticket?issueId=${id}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ticket-Buchungen laden fehlgeschlagen");
      setTicketTimeLines((data.lines || []) as MariTimeLine[]);
    } catch {
      setTicketTimeLines([]);
    } finally {
      setTicketTimeLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyPrefsPatch = (patch: MariTicketFilterPrefsPatch) => {
      if (patch.statuses && patch.statuses.length > 0) {
        setStatuses([...patch.statuses].sort((a, b) => a - b));
      }
      if (typeof patch.overdueOnly === "boolean") {
        setOverdueOnly(patch.overdueOnly);
      }
      if (patch.filterMode === "handler" || patch.filterMode === "customer") {
        setFilterMode(patch.filterMode);
      }
      if (patch.timelineSort === "newest" || patch.timelineSort === "oldest") {
        setTimelineSort(patch.timelineSort);
      }
      if (patch.listSort === "newest" || patch.listSort === "oldest") {
        setListSort(patch.listSort);
      }
      if (patch.listMetaFields && patch.listMetaFields.length > 0) {
        setListMetaFields(patch.listMetaFields);
      } else if (patch.listMetaFields) {
        setListMetaFields([...DEFAULT_MARI_LIST_META_FIELDS]);
      }
      if (patch.customers) {
        const next = patch.customers.map((c) => ({
          cardCode: c.cardCode,
          name: c.name || c.cardCode,
        }));
        setSelectedCustomers(next);
        setCustomerDraft(next);
      }
    };

    // Restore immediately from browser so Docker/API lag doesn't flash defaults.
    const local = readMariTicketFilterPrefsLocal();
    if (local) applyPrefsPatch(local);

    void (async () => {
      try {
        const res = await fetch("/api/maringo/ticket-filter-prefs");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          // Keep local/defaults — do not PUT defaults over a healthy DB.
          return;
        }
        const patch = parseMariTicketFilterPrefsPatch(data);
        if (patch) {
          applyPrefsPatch(patch);
          writeMariTicketFilterPrefsLocal(patch);
        }
      } catch {
        /* local/defaults bleiben */
      } finally {
        if (!cancelled) {
          skipFilterPrefsSaveRef.current = true;
          setFilterReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!filterReady) return;
    if (skipFilterPrefsSaveRef.current) {
      skipFilterPrefsSaveRef.current = false;
      return;
    }
    const payload = {
      statuses,
      overdueOnly,
      filterMode,
      customers: selectedCustomers,
      timelineSort,
      listSort,
      listMetaFields,
    };
    writeMariTicketFilterPrefsLocal(payload);
    const t = window.setTimeout(() => {
      void fetch("/api/maringo/ticket-filter-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        /* local mirror already written */
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [
    statuses,
    overdueOnly,
    filterMode,
    selectedCustomers,
    timelineSort,
    listSort,
    listMetaFields,
    filterReady,
  ]);

  useEffect(() => {
    if (filterMode === "customer") {
      setCustomerDraft(selectedCustomers);
    } else {
      setCustomerHits([]);
      setCustomerPickerOpen(false);
    }
    // Only when switching mode — not when applied selection changes mid-pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode]);

  useEffect(() => {
    if (filterMode !== "customer") return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setCustomerSearchBusy(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/maringo/customers?q=${encodeURIComponent(q)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          const hits = Array.isArray(data.customers)
            ? (data.customers as MariCustomerOption[])
            : [];
          setCustomerHits(hits);
          if (hits.length > 0) setCustomerPickerOpen(true);
        } catch {
          if (!cancelled) setCustomerHits([]);
        } finally {
          if (!cancelled) setCustomerSearchBusy(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [customerQuery, filterMode]);

  useEffect(() => {
    if (!filterReady) return;
    void loadList();
  }, [loadList, filterReady]);

  /** After idle / tab switch: auto-retry when MARI error is sticky. */
  useEffect(() => {
    if (!filterReady || workspaceTab !== "tickets") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!error) return;
      if (!/MARI HTTP|Login fehlgeschlagen|fehlgeschlagen/i.test(error)) {
        return;
      }
      void loadList();
      if (selectedId != null && ticketFlyoutOpen) {
        void loadDetail(selectedId);
        void loadTicketTimeLines(selectedId);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [
    error,
    filterReady,
    workspaceTab,
    loadList,
    loadDetail,
    loadTicketTimeLines,
    selectedId,
    ticketFlyoutOpen,
  ]);

  useEffect(() => {
    if (selectedId != null) {
      void loadDetail(selectedId);
      void loadTicketTimeLines(selectedId);
    } else {
      setDetail(null);
      setTicketTimeLines([]);
    }
  }, [selectedId, loadDetail, loadTicketTimeLines]);

  useEffect(() => {
    if (tickets.length === 0) {
      setSelectedId(null);
      setTicketFlyoutOpen(false);
      setSecondaryFlyouts([]);
      return;
    }
    if (selectedId == null || !tickets.some((t) => t.issueId === selectedId)) {
      setSelectedId(tickets[0].issueId);
    }
  }, [tickets, selectedId]);

  useEffect(() => {
    setFlyoutPortalReady(true);
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "hours") setWorkspaceTab("hours");
    const openRaw = searchParams.get("open");
    if (openRaw) {
      const id = Number(openRaw);
      if (Number.isFinite(id) && id > 0) {
        setSelectedId(id);
        setTicketFlyoutOpen(true);
        setWorkspaceTab("tickets");
      }
    }
  }, [searchParams]);

  useEffect(() => {
    setSecondaryFlyouts([]);
  }, [selectedId]);

  useEffect(() => {
    if (!ticketFlyoutOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [ticketFlyoutOpen]);

  useEffect(() => {
    if (!ticketFlyoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bookDialogOpen) return;
      // Nested MARI dialogs (z.B. Arbeitszeit bearbeiten) zuerst
      if (document.querySelector('[data-slot="dialog-overlay"]')) return;
      e.preventDefault();
      e.stopPropagation();
      if (secondaryFlyouts.length > 0) {
        setSecondaryFlyouts((s) => s.slice(0, -1));
        return;
      }
      setTicketFlyoutOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ticketFlyoutOpen, secondaryFlyouts, bookDialogOpen]);

  function openTicket(issueId: number) {
    setSelectedId(issueId);
    setTicketFlyoutOpen(true);
  }

  function closeTicketFlyout() {
    setSecondaryFlyouts([]);
    setTicketFlyoutOpen(false);
  }

  function toggleSecondary(id: MariSecondaryFlyoutId) {
    setSecondaryFlyouts((stack) => toggleMariSecondaryFlyout(stack, id));
  }

  function closeSecondary(id: MariSecondaryFlyoutId) {
    setSecondaryFlyouts((stack) => stack.filter((x) => x !== id));
  }

  async function bookFromSuggestion(s: MariTimeSuggestion) {
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${s.issueId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Ticket für Buchung laden fehlgeschlagen");
      }
      const ticket = data.ticket as MariTicketDetail | undefined;
      setPendingStampBook(s);
      setEditBookLineId(null);
      setEditBookDefaults(
        suggestionToBookDefaults(
          s,
          ticket
            ? {
                projectNumber: ticket.projectNumber,
                projectLabel: ticket.projectNumber
                              ? formatMariProjectLabel(
                                  ticket.projectNumber,
                                  ticket.addressMatchcode || ticket.cardCode
                                )
                              : "",
                contractId: ticket.contractId,
                contractPositionId: ticket.contractPositionId,
                activity: ticket.briefDescription,
              }
            : null
        )
      );
      setSelectedId(s.issueId);
      setBookDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleStatus(id: number) {
    setStatuses((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length === 0 ? prev : next;
      }
      return [...prev, id].sort((a, b) => a - b);
    });
  }

  function selectAllWorkStatuses() {
    setStatuses([...WORK_STATUS_IDS]);
    setOverdueOnly(false);
    setHandlerMode("list");
    if (defaultHandledBy) setHandledBy(defaultHandledBy);
    setManualHandledBy("");
  }

  function selectAllStatuses() {
    setStatuses([...ALL_STATUS_IDS]);
    setOverdueOnly(false);
  }

  function onHandlerSelectChange(value: string) {
    if (value === "__manual__") {
      setHandlerMode("manual");
      setManualHandledBy((prev) => prev || handledBy || defaultHandledBy);
      return;
    }
    setHandlerMode("list");
    setHandledBy(value);
  }

  async function runAnalyze(options?: { includeImages?: boolean }) {
    if (!selectedId) return;
    const includeImages = Boolean(options?.includeImages);
    setAnalyzing(true);
    setError(null);
    setAnalysisUsage(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeImages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setAnalysis(data.analysis as MariTicketAnalysis);
      setImagesAnalyzed(Number(data.imagesAnalyzed) || 0);
      setImageNames(
        Array.isArray(data.imageNames)
          ? data.imageNames.map((n: unknown) => String(n))
          : []
      );
      setAnalysisUsage(
        data.usage && typeof data.usage === "object"
          ? (data.usage as AiTokenUsage)
          : null
      );
      setReplyDraftLang(null);
      setSavedAnalyzedAt(
        typeof data.analyzedAt === "string"
          ? data.analyzedAt
          : new Date().toISOString()
      );
      setAnalysisInternalNotePostedAt(null);
      setAnalysisOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  function formatAnalyzedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("de-CH", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  async function changeNextReplyDraftLanguage(targetLang: ReplyLang) {
    const draft = analysis?.nextReplyDraft?.trim();
    if (!draft) return;
    if (nextReplyDraftLang === targetLang) return;
    setTranslatingReplyDraft(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/translate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Antwort",
          body: draft.slice(0, 4000),
          targetLang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || `Übersetzung fehlgeschlagen (${res.status})`
        );
      }
      const body = String(data.body || "").trim();
      if (!body) throw new Error("Übersetzung lieferte keinen Text.");
      setAnalysis((prev) =>
        prev ? { ...prev, nextReplyDraft: body.slice(0, 2000) } : prev
      );
      setReplyDraftLang(data.language === "en" ? "en" : "de");
      if (data.usage && typeof data.usage === "object") {
        setAnalysisUsage((prev) => {
          const u = data.usage as AiTokenUsage;
          if (!prev) return u;
          return {
            ...u,
            promptTokens: (prev.promptTokens || 0) + (u.promptTokens || 0),
            completionTokens:
              (prev.completionTokens || 0) + (u.completionTokens || 0),
            totalTokens: (prev.totalTokens || 0) + (u.totalTokens || 0),
            estimatedCostUsd:
              (prev.estimatedCostUsd || 0) + (u.estimatedCostUsd || 0),
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingReplyDraft(false);
    }
  }

  async function postAnalysisAsInternalNote() {
    if (!selectedId || !analysis) return;
    const ok = window.confirm(
      "AI-Vorschläge als internen Kommentar auf dem Ticket speichern?\n\nNur für internes Support-Personal sichtbar — nicht für den Kunden."
    );
    if (!ok) return;
    setPostingInternalNote(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/internal-note`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Interner Kommentar fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      const postedAt =
        typeof data.internalNotePostedAt === "string"
          ? data.internalNotePostedAt
          : new Date().toISOString();
      setAnalysisInternalNotePostedAt(postedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingInternalNote(false);
    }
  }

  async function postManualInternalNote() {
    if (!selectedId) return;
    const text = manualNoteDraft.trim();
    if (!text) {
      setError("Kommentar ist leer.");
      return;
    }
    const ok = window.confirm(
      "Internen Kommentar auf dem Ticket speichern?\n\nNur für internes Support-Personal sichtbar — nicht für den Kunden."
    );
    if (!ok) return;
    setPostingManualNote(true);
    setError(null);
    setManualNoteHint(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/internal-note`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Interner Kommentar fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      setManualNoteDraft("");
      setManualNoteHint(
        "Interner Kommentar gespeichert (nur intern sichtbar)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingManualNote(false);
    }
  }

  async function postManualExternalNote() {
    if (!selectedId) return;
    const text = externalNoteDraft.trim();
    if (!text) {
      setError("Kommentar ist leer.");
      return;
    }
    const ok = window.confirm(
      "Externen Kommentar nach Maringo schreiben?\n\nSichtbar für den Kunden — Maringo kann daraus eine Mail auslösen."
    );
    if (!ok) return;
    setPostingExternalNote(true);
    setError(null);
    setExternalNoteHint(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/external-note`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Externer Kommentar fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      setExternalNoteDraft("");
      setExternalNoteHint("Externer Kommentar an Maringo geschrieben.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingExternalNote(false);
    }
  }

  async function draftExternalNoteWithAi() {
    if (!selectedId) return;
    if (externalNoteDraft.trim()) {
      const ok = window.confirm(
        "AI-Entwurf ins Feld übernehmen?\n\nDer aktuelle Text im externen Kommentar wird ersetzt."
      );
      if (!ok) return;
    }
    setDraftingExternalNote(true);
    setError(null);
    setExternalNoteHint(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/external-note/draft`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "AI-Entwurf fehlgeschlagen");
      }
      const text = String(data.text || "").trim();
      if (!text) throw new Error("AI-Entwurf lieferte keinen Text.");
      setExternalNoteDraft(text);
      setExternalNoteHint(
        "AI-Entwurf eingefügt — bitte prüfen, dann «Extern speichern»."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftingExternalNote(false);
    }
  }

  async function deleteInternalNote(attachmentId: number) {
    if (!selectedId) return;
    const ok = window.confirm(
      "Internen Kommentar wirklich löschen?\n\nDer Eintrag wird in Maringo entfernt."
    );
    if (!ok) return;
    setDeletingAttachmentId(attachmentId);
    setError(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/internal-note?attachmentId=${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Löschen fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      if (data.clearedAnalysisMarker) {
        setAnalysisInternalNotePostedAt(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function patchTicket(body: {
    status?: number;
    dueDate?: string | null;
    priority?: number;
    projectNumber?: string | null;
    contractId?: number | null;
    contractPositionId?: number | null;
    activity?: string | null;
    stdFreigabe?: number | null;
  }) {
    if (!selectedId) return;
    setPatching(true);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Änderung fehlgeschlagen");
      setDetail(data.ticket as MariTicketDetail);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatching(false);
    }
  }

  async function saveTicketKopf(values: {
    projectNumber: string;
    contractId: number | null;
    contractPositionId: number | null;
    activity: string;
    stdFreigabe: number | null;
    contactPerson: string | null;
    contactEmail: string | null;
    supportGroupId: number | null;
    handledBy: string | null;
    priority: number | null;
    medium: number | null;
  }) {
    if (!selectedId) throw new Error("Kein Ticket gewählt.");
    setPatching(true);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectNumber: values.projectNumber,
          contractId: values.contractId,
          contractPositionId: values.contractPositionId,
          activity: values.activity,
          stdFreigabe: values.stdFreigabe,
          contactPerson: values.contactPerson,
          supportGroupId: values.supportGroupId,
          handledBy: values.handledBy,
          priority: values.priority ?? undefined,
          medium: values.medium,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Änderung fehlgeschlagen");
      setDetail(data.ticket as MariTicketDetail);
      await loadList();
    } finally {
      setPatching(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4 pb-10">
      <PageHeader
        title="Maringo Support"
        description="Support-Tickets, Verlauf, AI-Analyse und Stundenbuchung."
        logo={<MaringoLogo className="size-8" />}
        tone={pageVisuals.maringo.tone}
      />

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setTicketFlyoutOpen(false);
            setSecondaryFlyouts([]);
            setWorkspaceTab("tickets");
          }}
          className={cn(
            "h-auto rounded-full px-3 py-1.5 text-[12px] font-semibold",
            workspaceTab === "tickets"
              ? "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-100"
              : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
          )}
        >
          Tickets
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setTicketFlyoutOpen(false);
            setSecondaryFlyouts([]);
            setWorkspaceTab("hours");
          }}
          className={cn(
            "h-auto rounded-full px-3 py-1.5 text-[12px] font-semibold",
            workspaceTab === "hours"
              ? "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-100"
              : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
          )}
        >
          <Clock3 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          Stunden
        </Button>
      </div>

      {!configured ? (
        <Card className="border-amber-200/80 bg-amber-50/50 dark:border-amber-400/30 dark:bg-amber-500/10">
          <CardContent className="space-y-3 p-4 text-sm">
            <p>
              MARI-Login fehlt. Unter{" "}
              <Link
                href="/settings?tab=maringo"
                className="font-semibold text-orange-900 underline underline-offset-2 dark:text-orange-200"
              >
                Einstellungen → Maringo
              </Link>{" "}
              Benutzer, Passwort und Personalnummer hinterlegen.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      {workspaceTab === "hours" ? (
        <div className="space-y-4">
          <MaringoTimeSuggestionsPanel
            refreshKey={suggestionsRefresh}
            onBookSuggestion={(s) => void bookFromSuggestion(s)}
          />
          <MaringoTimekeepingPanel />
        </div>
      ) : (
      <div className="min-h-[70vh] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
        {/* List pane */}
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[13px] font-black tracking-tight">Tickets</p>
              <p className="text-[11px] text-muted-foreground">
                {tickets.length} Ticket{tickets.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => void loadList()}
              disabled={listLoading}
              aria-label="Aktualisieren"
            >
              <RefreshCw
                className={cn("size-4", listLoading && "animate-spin")}
                strokeWidth={APP_ICON_STROKE}
              />
            </Button>
          </div>

          <div className="space-y-1.5 border-b border-border/50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllWorkStatuses}
                className={cn(
                  "h-auto rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  statuses.length === WORK_STATUS_IDS.length && !overdueOnly
                    ? "border-orange-200/90 bg-orange-50/80 text-orange-900 dark:border-orange-400/35 dark:bg-orange-500/15 dark:text-orange-100"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                )}
              >
                Meine
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOverdueOnly((v) => !v)}
                className={cn(
                  "h-auto rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  overdueOnly
                    ? "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-100"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                )}
              >
                Überfällig
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[11px] font-semibold"
                    />
                  }
                >
                  Status · {statuses.length}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Status (Mehrfachauswahl)</DropdownMenuLabel>
                    {ALL_STATUS_IDS.map((id) => (
                      <DropdownMenuCheckboxItem
                        key={id}
                        checked={statuses.includes(id)}
                        onCheckedChange={() => toggleStatus(id)}
                      >
                        {STATUS_LABELS[id] || `Status ${id}`}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={selectAllWorkStatuses}>
                    Alle Arbeitsstatus
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={selectAllStatuses}>
                    Alle Status
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-border/70 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setListSort("newest")}
                  title="Neueste zuerst"
                  className={cn(
                    "h-auto rounded-full px-2 py-1 text-[11px] font-semibold",
                    listSort === "newest"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowDownAZ className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  Neu→Alt
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setListSort("oldest")}
                  title="Älteste zuerst"
                  className={cn(
                    "h-auto rounded-full px-2 py-1 text-[11px] font-semibold",
                    listSort === "oldest"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowUpAZ className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  Alt→Neu
                </Button>
              </div>
            </div>
            {statuses.length > 0 ? (
              <p
                className="truncate text-[11px] leading-snug text-muted-foreground"
                title={statuses
                  .map((id) => STATUS_LABELS[id] || `Status ${id}`)
                  .join(", ")}
              >
                {statuses
                  .map((id) => STATUS_LABELS[id] || `Status ${id}`)
                  .join(" · ")}
              </p>
            ) : null}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/20 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterMode("handler")}
                  className={cn(
                    "h-auto flex-1 rounded-md px-2 py-1 text-[11px] font-semibold",
                    filterMode === "handler"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Bearbeiter
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterMode("customer")}
                  className={cn(
                    "h-auto flex-1 rounded-md px-2 py-1 text-[11px] font-semibold",
                    filterMode === "customer"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Kunde
                </Button>
              </div>

              {filterMode === "handler" ? (
                <div>
                  <Label htmlFor="mari-handler" className="sr-only">
                    Bearbeiter
                  </Label>
                  <select
                    id="mari-handler"
                    className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    value={
                      handlerMode === "manual"
                        ? "__manual__"
                        : handledBy || defaultHandledBy || ""
                    }
                    onChange={(e) => onHandlerSelectChange(e.target.value)}
                    disabled={!configured}
                  >
                    {!handledBy && !defaultHandledBy ? (
                      <option value="">Laden…</option>
                    ) : null}
                    {employees.map((e) => (
                      <option key={e.employeeNumber} value={e.employeeNumber}>
                        {e.matchcode} ({e.employeeNumber})
                        {defaultHandledBy &&
                        e.employeeNumber === defaultHandledBy
                          ? " · ich"
                          : ""}
                      </option>
                    ))}
                    {handledBy &&
                    !employees.some((e) => e.employeeNumber === handledBy) ? (
                      <option value={handledBy}>{handledBy}</option>
                    ) : null}
                    <option value="__manual__">Andere Nummer…</option>
                  </select>
                  {handlerMode === "manual" ? (
                    <Input
                      value={manualHandledBy}
                      onChange={(e) =>
                        setManualHandledBy(e.target.value.toUpperCase())
                      }
                      placeholder="z.B. M2055"
                      className="mt-1.5 h-8 text-[12px]"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  ) : null}
                  {effectiveHandledBy &&
                  defaultHandledBy &&
                  effectiveHandledBy !== defaultHandledBy ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Ansicht: {effectiveHandledBy} (nicht deine Nummer{" "}
                      {defaultHandledBy})
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {selectedCustomers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedCustomers.map((c) => (
                        <Button
                          key={c.cardCode}
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Abwählen"
                          onClick={() => {
                            setSelectedCustomers((prev) =>
                              prev.filter((x) => x.cardCode !== c.cardCode)
                            );
                            setCustomerDraft((prev) =>
                              prev.filter((x) => x.cardCode !== c.cardCode)
                            );
                          }}
                          className="inline-flex h-auto max-w-full items-center gap-1 rounded-full border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-100"
                        >
                          <span className="truncate">
                            {c.name}
                            <span className="ml-1 font-normal opacity-70">
                              {c.cardCode}
                            </span>
                          </span>
                          <X className="size-3 shrink-0 opacity-60" aria-hidden />
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative">
                    <Label htmlFor="mari-customer-search" className="sr-only">
                      Kunde suchen
                    </Label>
                    <Input
                      id="mari-customer-search"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      placeholder="z.B. Bübchen oder CardCode…"
                      className="h-8 text-[12px]"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={!configured}
                    />
                    {customerSearchBusy ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Suche…
                      </p>
                    ) : null}
                    {customerPickerOpen && customerHits.length > 0 ? (
                      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border/70 bg-background shadow-md">
                        <ul className="max-h-48 overflow-y-auto py-1">
                          {customerHits.map((hit) => {
                            const checked = customerDraft.some(
                              (c) => c.cardCode === hit.cardCode
                            );
                            return (
                              <li key={hit.cardCode}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className={cn(
                                    "h-auto w-full items-start justify-start gap-2 px-2.5 py-1.5 text-left text-[12px] font-normal",
                                    checked && "bg-sky-50/80 dark:bg-sky-500/15"
                                  )}
                                  onClick={() => {
                                    setCustomerDraft((prev) =>
                                      checked
                                        ? prev.filter(
                                            (c) => c.cardCode !== hit.cardCode
                                          )
                                        : [...prev, hit]
                                    );
                                  }}
                                >
                                  <span
                                    className={cn(
                                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                                      checked
                                        ? "border-sky-600 bg-sky-600 text-white"
                                        : "border-border/80 bg-background"
                                    )}
                                    aria-hidden
                                  >
                                    {checked ? (
                                      <Check className="size-3" strokeWidth={3} />
                                    ) : null}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-semibold">
                                      {hit.name}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted-foreground">
                                      {hit.cardCode}
                                    </span>
                                  </span>
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/20 px-2 py-1.5">
                          <p className="text-[10px] text-muted-foreground">
                            {customerDraft.length} gewählt
                          </p>
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                setCustomerDraft(selectedCustomers);
                                setCustomerQuery("");
                                setCustomerHits([]);
                                setCustomerPickerOpen(false);
                              }}
                            >
                              Abbrechen
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 bg-sky-600 px-2.5 text-[11px] text-white hover:bg-sky-700"
                              onClick={() => {
                                setSelectedCustomers(customerDraft);
                                setCustomerQuery("");
                                setCustomerHits([]);
                                setCustomerPickerOpen(false);
                              }}
                            >
                              Übernehmen
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {customerQuery.trim().length >= 2 &&
                    !customerSearchBusy &&
                    customerHits.length === 0 ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Keine Treffer
                      </p>
                    ) : null}
                  </div>
                  {selectedCustomers.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">
                      Mehrere Kunden anhaken, dann «Übernehmen» — Tickets aller
                      Bearbeiter.
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      {selectedCustomers.length} Kunde
                      {selectedCustomers.length === 1 ? "" : "n"} aktiv · Tickets
                      aller Kollegen
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {listLoading && tickets.length === 0 ? (
              <li className="px-3 py-8 text-sm text-muted-foreground">
                Lade Tickets…
              </li>
            ) : null}
            {!listLoading && tickets.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                {filterMode === "customer" && selectedCustomers.length === 0
                  ? "Kunde wählen, um Tickets zu laden."
                  : "Keine Tickets für die gewählten Filter."}
              </li>
            ) : null}
            {sortedTickets.map((t) => {
              const active = t.issueId === selectedId;
              const due = formatDayMonth(t.dueDate);
              const overdue = isOverdue(t.dueDate);
              const metaItems = buildMariTicketListMetaItems(
                t,
                listMetaFields
              );
              const stamp = listCalendarStamps[t.issueId] || null;
              return (
                <li key={t.issueId} className="border-b border-border/40 last:border-b-0">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => openTicket(t.issueId)}
                    className={cn(
                      "relative h-auto w-full items-start justify-start gap-2 rounded-none border-l-2 px-2.5 py-2 text-left",
                      active
                        ? "border-l-orange-400 bg-orange-50/70 hover:bg-orange-50/70 dark:bg-orange-500/15 dark:hover:bg-orange-500/15"
                        : "border-l-transparent hover:bg-muted/40"
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">
                          #{t.issueId}
                        </span>
                        <p className="min-w-0 truncate text-[13px] font-semibold leading-snug tracking-tight">
                          {t.briefDescription}
                        </p>
                      </div>
                      {metaItems.length > 0 ? (
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                          {metaItems.map((item, idx) => (
                            <span
                              key={`${item.id}-${idx}`}
                              className="inline-flex min-w-0 items-center gap-1.5"
                            >
                              {idx > 0 ? (
                                <span className="text-border" aria-hidden>
                                  ·
                                </span>
                              ) : null}
                              {item.kind === "customer" ? (
                                <MariCustomerChip className="max-w-[14rem]">
                                  {item.value}
                                </MariCustomerChip>
                              ) : (
                                <span className="truncate">{item.value}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {stamp ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/90 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-950 shadow-sm dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100"
                        title={`Termin eingeplant · ${formatStampWhen(stamp)}`}
                      >
                        Termin ({formatStampWhen(stamp)})
                      </span>
                    ) : null}
                    <div className="relative z-[2] flex shrink-0 flex-col items-end gap-1 pt-0.5">
                      <StatusChip
                        status={t.status}
                        statusName={t.statusName}
                        className="h-4 px-1.5 text-[9px]"
                      />
                      {due ? (
                        <span
                          className={cn(
                            "text-[11px] font-semibold tabular-nums",
                            overdue ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"
                          )}
                          title={
                            formatDateShort(t.dueDate)
                              ? `Stichtag ${formatDateShort(t.dueDate)}`
                              : undefined
                          }
                        >
                          {due}
                        </span>
                      ) : null}
                    </div>
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

      </div>
      )}

      {flyoutPortalReady && ticketFlyoutPresence.mounted
        ? createPortal(
            <div className="fixed inset-0 z-[1000]">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "absolute inset-0 h-auto w-full rounded-none border-0 bg-black/20 p-0 transition-opacity ease-in-out hover:bg-black/20",
                  ticketFlyoutPresence.entered ? "opacity-100" : "opacity-0"
                )}
                style={{ transitionDuration: `${MARI_FLYOUT_MS}ms` }}
                aria-label="Flyout schliessen"
                onClick={closeTicketFlyout}
              />
              <MariMainFlyoutShell open={ticketFlyoutPresence.entered}>
                <MariTicketFlyoutRail
                  openIds={secondaryFlyouts}
                  onToggle={toggleSecondary}
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {detailLoading && !detail ? (
                    <>
                      <div className="flex shrink-0 items-center justify-end border-b border-border/50 px-3 py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={closeTicketFlyout}
                          aria-label="Schliessen"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                        Lade Ticket…
                      </div>
                    </>
                  ) : detail ? (
                    <>
                      <div
                        className={cn(
                          "flex shrink-0 items-start gap-2.5 px-4 py-2",
                          statusDetailHeaderClass(detail.status)
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold tabular-nums text-current/70">
                            #{detail.issueId}
                          </p>
                          <h2 className="text-[15px] font-bold leading-snug tracking-tight">
                            {detail.briefDescription}
                          </h2>
                        </div>
                        <StatusChip
                          status={detail.status}
                          statusName={detail.statusName}
                          className="mt-0.5"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0 text-current hover:bg-black/5"
                                disabled={patching}
                              />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Status setzen</DropdownMenuLabel>
                              {[11, 1, 3, 6, 7, 13, 14, 2, 5].map((id) => (
                                <DropdownMenuItem
                                  key={id}
                                  disabled={patching || detail.status === id}
                                  onClick={() => void patchTicket({ status: id })}
                                >
                                  {STATUS_LABELS[id] || id}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0 text-current hover:bg-black/5"
                          onClick={closeTicketFlyout}
                          aria-label="Schliessen"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>

                      <div className="shrink-0 space-y-2.5 border-b border-border/50 px-4 py-2.5">
                        <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2">
                          <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            <DetailField label="Typ">
                              {detail.issueTypeName || "–"}
                            </DetailField>
                            <DetailField label="Produkt">
                              {detail.productName || "–"}
                            </DetailField>
                            <DetailField label="Matchcode">
                              {detail.addressMatchcode || "–"}
                            </DetailField>
                            <DetailField label="Projekt">
                              {detail.projectNumber ? (
                                <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px]">
                                  {(
                                    detail.addressMatchcode || detail.cardCode
                                  )?.trim() ? (
                                    <>
                                      <MariCustomerChip>
                                        {(
                                          detail.addressMatchcode ||
                                          detail.cardCode
                                        )!.trim()}
                                      </MariCustomerChip>
                                      <span className="font-medium tabular-nums text-muted-foreground">
                                        ({detail.projectNumber})
                                      </span>
                                    </>
                                  ) : (
                                    <span className="font-medium tabular-nums">
                                      {detail.projectNumber}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "–"
                              )}
                            </DetailField>
                            <DetailField label="Vertrag">
                              {detail.contractNumber ||
                                (detail.contractId != null
                                  ? String(detail.contractId)
                                  : "–")}
                            </DetailField>
                            <DetailField label="Phase">
                              {detail.phaseName ||
                                (detail.phaseId != null
                                  ? String(detail.phaseId)
                                  : "–")}
                            </DetailField>
                            <DetailField label="Prio">
                              <span className="inline-flex items-center gap-1">
                                <Flag className="size-3 shrink-0 text-muted-foreground" />
                                {detail.priorityName}
                              </span>
                            </DetailField>
                            <DetailField label="Adresse">
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <User className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">
                                  {detail.cardCode || "–"}
                                </span>
                              </span>
                            </DetailField>
                            <DetailField label="Zuständig">
                              {detail.handledByName || detail.handledBy || "–"}
                            </DetailField>
                            <DetailField label="Supportgruppe">
                              {detail.supportGroupName || "–"}
                            </DetailField>
                            <DetailField label="Ansprechpartner">
                              {primaryContact(detail.contactPerson) || "–"}
                            </DetailField>
                            <DetailField label="Datum">
                              {formatDateTimeShort(detail.requestDate) || "–"}
                            </DetailField>
                            <DetailField label="Geändert am">
                              {formatDateTimeShort(detail.changeAtDate) || "–"}
                            </DetailField>
                            <DetailField label="Referenz">
                              {detail.referenceText || "–"}
                            </DetailField>
                            <DetailField label="Std. Freigabe">
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-left font-medium text-orange-900 dark:text-orange-200"
                                onClick={() => toggleSecondary("kopf")}
                                title="Ticket-Kopf bearbeiten"
                              >
                                {detail.stdFreigabe
                                  ? `${detail.stdFreigabe} h`
                                  : "–"}
                              </Button>
                            </DetailField>
                            {detail.aiLabel ? (
                              <DetailField label="AI">{detail.aiLabel}</DetailField>
                            ) : null}
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                            <Calendar className="size-3.5 text-muted-foreground" />
                            <Label htmlFor="dueDate" className="sr-only">
                              Stichtag
                            </Label>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Stichtag
                            </p>
                            <Input
                              id="dueDate"
                              type="date"
                              className="h-7 w-auto border-border/60 bg-background px-2 shadow-none"
                              value={dueDraft}
                              onChange={(e) => setDueDraft(e.target.value)}
                              disabled={patching}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              disabled={patching || !dueDraft}
                              onClick={() =>
                                void patchTicket({ dueDate: dueDraft || null })
                              }
                            >
                              Setzen
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {savedAnalyzedAt ? (
                            <Badge className="bg-orange-100 text-orange-900 hover:bg-orange-100 dark:bg-orange-500/20 dark:text-orange-100 dark:hover:bg-orange-500/20">
                              Analyse vorhanden ·{" "}
                              {formatAnalyzedAt(savedAnalyzedAt)}
                            </Badge>
                          ) : null}
                          {analysisInternalNotePostedAt ? (
                            <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/20">
                              Bereits als intern gespeichert
                              {savedAnalyzedAt
                                ? ` · ${formatAnalyzedAt(analysisInternalNotePostedAt)}`
                                : ""}
                            </Badge>
                          ) : null}
                          {analysis && savedAnalyzedAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-orange-300 text-orange-900 hover:bg-orange-50 dark:border-orange-400/40 dark:text-orange-200 dark:hover:bg-orange-500/15"
                              onClick={() => setAnalysisOpen((open) => !open)}
                            >
                              <Sparkles className="size-3.5" />
                              {analysisOpen
                                ? "Analyse ausblenden"
                                : "Analyse anzeigen"}
                            </Button>
                          ) : null}
                          {detailImageAttachmentCount > 0 ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                disabled={analyzing}
                                render={
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="bg-orange-500 text-white hover:bg-orange-600"
                                    disabled={analyzing}
                                  />
                                }
                              >
                                <Sparkles className="size-3.5" />
                                {analyzing
                                  ? "Analysiert…"
                                  : savedAnalyzedAt
                                    ? "Neu analysieren"
                                    : "AI analysieren"}
                                <ChevronDown className="size-3.5 opacity-80" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="w-72"
                              >
                                <DropdownMenuLabel>
                                  Analyse-Modus
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={analyzing}
                                  onClick={() =>
                                    void runAnalyze({ includeImages: false })
                                  }
                                >
                                  <span className="flex flex-col gap-0.5">
                                    <span className="font-medium">Nur Text</span>
                                    <span className="text-[11px] text-muted-foreground">
                                      Chat-Provider (z. B. DeepSeek) — empfohlen
                                    </span>
                                  </span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={analyzing}
                                  onClick={() =>
                                    void runAnalyze({ includeImages: true })
                                  }
                                >
                                  <span className="flex flex-col gap-0.5">
                                    <span className="font-medium">
                                      Mit Screenshots (
                                      {detailImageAttachmentCount})
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      OpenAI Vision — wenn Bildinhalt wichtig
                                      ist
                                    </span>
                                  </span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-orange-500 text-white hover:bg-orange-600"
                              disabled={analyzing}
                              onClick={() =>
                                void runAnalyze({ includeImages: false })
                              }
                            >
                              <Sparkles className="size-3.5" />
                              {analyzing
                                ? "Analysiert…"
                                : savedAnalyzedAt
                                  ? "Neu analysieren"
                                  : "AI analysieren"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            title={
                              ticketCalendarStamp
                                ? `Termin eingeplant · ${formatStampWhen(ticketCalendarStamp)} — erneut öffnen für weiteren Termin`
                                : "Termin aus Ticket — Slot suchen und anlegen"
                            }
                            onClick={() => setTicketCalendarOpen(true)}
                            className={cn(
                              ticketCalendarStamp &&
                                "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 hover:text-emerald-950 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25 dark:hover:text-emerald-50"
                            )}
                          >
                            <CalendarPlus className="size-3.5" />
                            {ticketCalendarStamp
                              ? `Termin eingeplant (${formatStampWhen(ticketCalendarStamp)})`
                              : "Termin"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!detail.projectNumber}
                            title={
                              detail.projectNumber
                                ? "Stunden auf dieses Ticket buchen"
                                : "Ticket hat kein Projekt hinterlegt"
                            }
                            onClick={() => toggleSecondary("buchen")}
                          >
                            <Clock3 className="size-3.5" />
                            Zeit buchen
                          </Button>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        {analysis && analysisOpen ? (
                          <Card className="border-orange-200/70 bg-orange-50/40 dark:border-orange-400/30 dark:bg-orange-500/10">
                            <CardContent className="space-y-3 p-4 text-[13px]">
                              <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-orange-900 dark:text-orange-100">
                                <Sparkles className="size-3.5" />
                                AI-Zusammenfassung
                              </p>
                              {savedAnalyzedAt ? (
                                <p className="text-[11px] text-orange-900/70 dark:text-orange-200/80">
                                  Gespeichert {formatAnalyzedAt(savedAnalyzedAt)}
                                </p>
                              ) : null}
                              {imagesAnalyzed > 0 ? (
                                <p className="text-[11px] text-orange-900/80 dark:text-orange-200/85">
                                  Inkl. {imagesAnalyzed} Screenshot
                                  {imagesAnalyzed === 1 ? "" : "s"} (OpenAI
                                  Vision)
                                  {imageNames.length
                                    ? `: ${imageNames.slice(0, 4).join(", ")}`
                                    : ""}
                                </p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">
                                  Textanalyse ohne Screenshot-Vision
                                  (Chat-Provider).
                                </p>
                              )}
                              {analysisUsageLines.length > 0 ? (
                                <div className="rounded-lg border border-orange-200/50 bg-white/50 px-2.5 py-2 text-[11px] leading-relaxed text-orange-950/80 dark:border-orange-400/25 dark:bg-black/20 dark:text-orange-100/85">
                                  <p className="font-semibold text-orange-900/90 dark:text-orange-100">
                                    Token / Kosten (nur in Buddy)
                                  </p>
                                  <ul className="mt-1 space-y-0.5">
                                    {analysisUsageLines.map((line) => (
                                      <li key={line}>{line}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              <p className="leading-relaxed">
                                {analysis.summary}
                              </p>
                              <div className="rounded-xl border border-orange-200/60 bg-white/70 px-3 py-2 dark:border-orange-400/25 dark:bg-black/20">
                                <p className="font-semibold">
                                  Vollständigkeit:{" "}
                                  {analysis.completeness.score}/100
                                </p>
                                {analysis.completeness.missing.length > 0 ? (
                                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                                    {analysis.completeness.missing.map((m) => (
                                      <li key={m}>{m}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-muted-foreground">
                                    Keine kritischen Lücken erkannt.
                                  </p>
                                )}
                              </div>
                              {analysis.suggestedTasks.length > 0 ? (
                                <div>
                                  <p className="font-semibold">Aufgaben</p>
                                  <ul className="mt-1 space-y-1">
                                    {analysis.suggestedTasks.map((t) => (
                                      <li
                                        key={t.title}
                                        className="rounded-lg border border-border/50 bg-white/60 px-2.5 py-1.5 dark:bg-black/20"
                                      >
                                        <span className="font-medium">
                                          {t.title}
                                        </span>
                                        {t.reason ? (
                                          <span className="text-muted-foreground">
                                            {" "}
                                            — {t.reason}
                                          </span>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {analysis.suggestions.length > 0 ? (
                                <div>
                                  <p className="font-semibold">Vorschläge</p>
                                  <ul className="mt-1 list-disc pl-4">
                                    {analysis.suggestions.map((s) => (
                                      <li key={s}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {analysis.solutionSketch &&
                              analysis.solutionSketch.problemStillOpen ? (
                                <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 px-3 py-2.5 dark:border-sky-400/30 dark:bg-sky-500/12">
                                  <p className="font-semibold text-sky-950 dark:text-sky-100">
                                    Lösungsansatz (ausführlich)
                                  </p>
                                  {analysis.solutionSketch.vendors.length >
                                  0 ? (
                                    <p className="mt-1 text-[11px] text-sky-900/80 dark:text-sky-200/85">
                                      Hersteller:{" "}
                                      {analysis.solutionSketch.vendors.join(
                                        " · "
                                      )}
                                    </p>
                                  ) : null}
                                  <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-sky-950/95">
                                    {analysis.solutionSketch.outline}
                                  </pre>
                                  {analysis.solutionSketch.steps.length > 0 ? (
                                    <ol className="mt-3 list-decimal space-y-2 pl-4 text-[12px] text-sky-950/95">
                                      {analysis.solutionSketch.steps.map(
                                        (s, i) => (
                                          <li
                                            key={`${s.where}-${s.action}-${i}`}
                                          >
                                            <span className="font-semibold">
                                              {s.where}
                                            </span>
                                            <span className="text-sky-900/80">
                                              {" "}
                                              —{" "}
                                            </span>
                                            {s.action}
                                            {s.detail ? (
                                              <p className="mt-0.5 text-[11px] text-sky-900/75">
                                                {s.detail}
                                              </p>
                                            ) : null}
                                          </li>
                                        )
                                      )}
                                    </ol>
                                  ) : null}
                                  {analysis.solutionSketch.artifacts.length >
                                  0 ? (
                                    <div className="mt-3 space-y-2.5">
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900/80">
                                        Queries / Skripte / Code
                                      </p>
                                      {analysis.solutionSketch.artifacts.map(
                                        (a, i) => (
                                          <div
                                            key={`${a.kind}-${a.title}-${i}`}
                                            className="overflow-hidden rounded-lg border border-sky-200/70 bg-white/80 dark:border-sky-400/25 dark:bg-black/20"
                                          >
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-sky-100 px-2.5 py-1.5 text-[11px]">
                                              <span className="font-semibold text-sky-950 dark:text-sky-100">
                                                {a.title}
                                              </span>
                                              <span className="rounded bg-sky-100/80 px-1.5 py-0.5 font-mono text-[10px] text-sky-900 dark:bg-sky-500/20 dark:text-sky-100">
                                                {a.kind}
                                              </span>
                                              {a.language ? (
                                                <span className="text-sky-900/60">
                                                  {a.language}
                                                </span>
                                              ) : null}
                                            </div>
                                            {a.note ? (
                                              <p className="border-b border-sky-100 px-2.5 py-1 text-[11px] text-sky-900/70">
                                                {a.note}
                                              </p>
                                            ) : null}
                                            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap p-2.5 font-mono text-[11px] leading-snug text-sky-950">
                                              {a.code}
                                            </pre>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  ) : null}
                                  {analysis.solutionSketch.caveats ? (
                                    <p className="mt-2 text-[11px] text-sky-900/70">
                                      {analysis.solutionSketch.caveats}
                                    </p>
                                  ) : (
                                    <p className="mt-2 text-[11px] text-sky-900/70">
                                      Vorschlag aus allgemein verfügbarem
                                      Herstellerwissen (u.a. SAP Business One,
                                      nicht S/4) — bitte mit offizieller Doku
                                      abgleichen.
                                    </p>
                                  )}
                                </div>
                              ) : null}
                              {analysis.nextReplyDraft ? (
                                <div>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold">
                                      Antwort-Entwurf
                                      {translatingReplyDraft
                                        ? " · übersetzt…"
                                        : ""}
                                    </p>
                                    <ReplyLangToggle
                                      lang={nextReplyDraftLang}
                                      busy={
                                        translatingReplyDraft || analyzing
                                      }
                                      onChange={(next) =>
                                        void changeNextReplyDraftLanguage(next)
                                      }
                                    />
                                  </div>
                                  <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-border/50 bg-white/70 p-2.5 font-sans text-[12px] dark:bg-black/20">
                                    {analysis.nextReplyDraft}
                                  </pre>
                                </div>
                              ) : null}
                              <div className="flex flex-col gap-2 border-t border-orange-200/50 pt-3">
                                {analysisInternalNotePostedAt ? (
                                  <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 dark:border-emerald-400/30 dark:bg-emerald-500/12">
                                    <p className="text-[12px] font-semibold text-emerald-950">
                                      Bereits als intern gespeichert
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-emerald-900/75">
                                      {formatAnalyzedAt(
                                        analysisInternalNotePostedAt
                                      )}{" "}
                                      · nur Support, nicht für den Kunden
                                    </p>
                                  </div>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-orange-300/80 bg-white/80 text-orange-950 hover:bg-orange-100/80 dark:border-orange-400/40 dark:bg-card dark:text-orange-100 dark:hover:bg-orange-500/15"
                                  disabled={postingInternalNote}
                                  onClick={() =>
                                    void postAnalysisAsInternalNote()
                                  }
                                >
                                  <Lock className="size-3.5" />
                                  {postingInternalNote
                                    ? "Schreibe intern…"
                                    : analysisInternalNotePostedAt
                                      ? "Erneut als intern speichern"
                                      : "Als internen Kommentar schreiben"}
                                </Button>
                                {!analysisInternalNotePostedAt ? (
                                  <p className="text-[11px] text-orange-900/75 dark:text-orange-200/80">
                                    Wird mit Flag «Internal» nach Maringo
                                    geschrieben — nur für Support sichtbar,
                                    nicht für den Kunden.
                                  </p>
                                ) : null}
                              </div>
                            </CardContent>
                          </Card>
                        ) : null}

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => toggleSecondary("buchungen")}
                          className="h-auto w-full flex-col items-start justify-start rounded-2xl border-border/60 bg-muted/20 px-3.5 py-3 text-left hover:bg-muted/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-[13px] font-black tracking-tight">
                                <Clock3 className="size-3.5 text-muted-foreground" />
                                Buchungen
                              </p>
                              <p className="mt-1 text-[12px] text-muted-foreground">
                                {ticketTimeLoading
                                  ? "Lade Buchungen…"
                                  : ticketTimeLines.length === 0
                                    ? "Noch keine Stundenbuchungen"
                                    : `${ticketTimeHoursTotal} Std · ${ticketTimeLines.length} Buchung${ticketTimeLines.length === 1 ? "" : "en"}`}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-orange-800 dark:text-orange-300">
                              Öffnen
                            </span>
                          </div>
                        </Button>

                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-black tracking-tight">
                            <Lock className="size-3.5 text-muted-foreground" />
                            Interner Kommentar
                          </h3>
                          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/40 px-3.5 py-3 dark:border-amber-400/30 dark:bg-amber-500/10">
                            <Label
                              htmlFor="manual-internal-note"
                              className="sr-only"
                            >
                              Interner Kommentar
                            </Label>
                            <Textarea
                              id="manual-internal-note"
                              rows={5}
                              value={manualNoteDraft}
                              onChange={(e) =>
                                setManualNoteDraft(e.target.value)
                              }
                              placeholder="Eigene Notiz fürs Support-Team (nicht für den Kunden)…"
                              disabled={postingManualNote}
                              className="resize-y border-amber-200/80 bg-white/80 text-[13px] dark:border-amber-400/30 dark:bg-card"
                            />
                            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[11px] text-amber-950/70 dark:text-amber-200/75">
                                Wird mit Flag «Internal» nach Maringo
                                geschrieben — nur intern sichtbar.
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0 border-amber-300/80 bg-white/80 text-amber-950 hover:bg-amber-100/80 dark:border-amber-400/40 dark:bg-card dark:text-amber-100 dark:hover:bg-amber-500/15"
                                disabled={
                                  postingManualNote || !manualNoteDraft.trim()
                                }
                                onClick={() => void postManualInternalNote()}
                              >
                                <Lock className="size-3.5" />
                                {postingManualNote
                                  ? "Speichere…"
                                  : "Intern speichern"}
                              </Button>
                            </div>
                            {manualNoteHint ? (
                              <p className="mt-2 text-[11px] font-medium text-emerald-800">
                                {manualNoteHint}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-black tracking-tight">
                            <Mail className="size-3.5 text-muted-foreground" />
                            Externer Kommentar
                          </h3>
                          <div className="rounded-2xl border border-sky-200/70 bg-sky-50/40 px-3.5 py-3 dark:border-sky-400/30 dark:bg-sky-500/10">
                            <Label
                              htmlFor="manual-external-note"
                              className="sr-only"
                            >
                              Externer Kommentar
                            </Label>
                            <Textarea
                              id="manual-external-note"
                              rows={5}
                              value={externalNoteDraft}
                              onChange={(e) =>
                                setExternalNoteDraft(e.target.value)
                              }
                              placeholder="Antwort an den Kunden (sichtbar / Mail über Maringo)…"
                              disabled={
                                postingExternalNote || draftingExternalNote
                              }
                              className="resize-y border-sky-200/80 bg-white/80 text-[13px] dark:border-sky-400/30 dark:bg-card"
                            />
                            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[11px] text-sky-950/70">
                                Wird ohne «Internal» nach Maringo geschrieben —
                                Mailversand übernimmt Maringo.
                              </p>
                              <div className="flex shrink-0 flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-sky-300/80 bg-white/80 text-sky-950 hover:bg-sky-100/80 dark:border-sky-400/40 dark:bg-card dark:text-sky-100 dark:hover:bg-sky-500/15"
                                  disabled={
                                    draftingExternalNote || postingExternalNote
                                  }
                                  title="Kurzer Kundenkommentar: Eingang, ggf. fehlende Details, baldige Bearbeitung"
                                  onClick={() => void draftExternalNoteWithAi()}
                                >
                                  <Sparkles className="size-3.5" />
                                  {draftingExternalNote
                                    ? "Entwurf…"
                                    : "AI-Entwurf"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-sky-300/80 bg-white/80 text-sky-950 hover:bg-sky-100/80 dark:border-sky-400/40 dark:bg-card dark:text-sky-100 dark:hover:bg-sky-500/15"
                                  disabled={
                                    postingExternalNote ||
                                    draftingExternalNote ||
                                    !externalNoteDraft.trim()
                                  }
                                  onClick={() => void postManualExternalNote()}
                                >
                                  <Mail className="size-3.5" />
                                  {postingExternalNote
                                    ? "Sende…"
                                    : "Extern speichern"}
                                </Button>
                              </div>
                            </div>
                            {externalNoteHint ? (
                              <p className="mt-2 text-[11px] font-medium text-emerald-800">
                                {externalNoteHint}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {detail.requestTextPlain ? (
                          <div>
                            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-black tracking-tight">
                              <Inbox className="size-3.5 text-muted-foreground" />
                              Anfragetext
                            </h3>
                            <div className="rounded-2xl border border-teal-200/70 bg-teal-50/40 px-3.5 py-2.5 text-[13px] leading-relaxed text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-50">
                              <div className="whitespace-pre-wrap">
                                {detail.requestTextPlain}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => toggleSecondary("verlauf")}
                          className="h-auto w-full items-center justify-between rounded-2xl border-border/60 bg-muted/20 px-3.5 py-3 text-left hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-[13px] font-black tracking-tight">
                              <MessageSquare className="size-3.5 text-muted-foreground" />
                              Verlauf öffnen ({detail.timeline.length})
                            </p>
                            <span className="shrink-0 text-[11px] font-semibold text-orange-800 dark:text-orange-300">
                              Öffnen
                            </span>
                          </div>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex shrink-0 items-center justify-end border-b border-border/50 px-3 py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={closeTicketFlyout}
                          aria-label="Schliessen"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                        Ticket nicht geladen
                      </div>
                    </>
                  )}
                </div>
              </MariMainFlyoutShell>

              {secondaryPresence.rendered.map((id, i) => {
                const meta = MARI_SECONDARY_FLYOUT_META[id];
                const widthClass =
                  id === "buchen" || id === "buchungen" || id === "kopf"
                    ? "w-[min(100%,34rem)]"
                    : "w-[min(100%,30rem)]";
                const entered = secondaryPresence.isEntered(id);
                const openIndex = secondaryFlyouts.indexOf(id);
                const offsetBase =
                  openIndex >= 0
                    ? secondaryFlyouts.length - 1 - openIndex
                    : secondaryPresence.rendered.length - 1 - i;
                return (
                  <MariSecondaryFlyoutShell
                    key={id}
                    title={meta.label}
                    description={meta.description}
                    onClose={() => closeSecondary(id)}
                    widthClass={widthClass}
                    zIndex={1010 + i}
                    offsetPx={offsetBase * 12}
                    open={entered && ticketFlyoutPresence.entered}
                  >
                    {id === "verlauf" ? (
                      <div className="space-y-3">
                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTimelineSort("newest")}
                            className={cn(
                              "h-auto rounded-md px-2 py-1 text-[11px] font-semibold",
                              timelineSort === "newest"
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <ArrowDownAZ className="size-3.5" />
                            Aktuellste oben
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTimelineSort("oldest")}
                            className={cn(
                              "h-auto rounded-md px-2 py-1 text-[11px] font-semibold",
                              timelineSort === "oldest"
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <ArrowUpAZ className="size-3.5" />
                            Älteste oben
                          </Button>
                        </div>
                        {sortedTimeline.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                            <Inbox className="mx-auto mb-2 size-5 opacity-50" />
                            {detail?.requestTextPlain
                              ? "Noch keine weiteren Verlaufseinträge."
                              : "Kein Verlauf und kein Anfragetext vorhanden."}
                          </div>
                        ) : (
                          <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[0.7rem] before:w-px before:bg-border">
                            {sortedTimeline.map((item) => (
                              <TimelineRow
                                key={item.id}
                                item={item}
                                deletingAttachmentId={deletingAttachmentId}
                                onDeleteInternalNote={(attachmentId) =>
                                  void deleteInternalNote(attachmentId)
                                }
                              />
                            ))}
                          </ol>
                        )}
                      </div>
                    ) : null}
                    {id === "kopf" && detail ? (
                      <MaringoTicketKopfForm
                        key={`kopf-${detail.issueId}-${detail.changeAtDate || ""}`}
                        defaults={{
                          projectNumber: detail.projectNumber,
                          projectLabel: detail.projectNumber
                              ? formatMariProjectLabel(
                                  detail.projectNumber,
                                  detail.addressMatchcode || detail.cardCode
                                )
                              : "",
                          contractId: detail.contractId,
                          contractPositionId: detail.contractPositionId,
                          activity: detail.briefDescription,
                          stdFreigabe: detail.stdFreigabe,
                          contactPerson: detail.contactPerson,
                          supportGroupId: detail.supportGroupId,
                          handledBy: detail.handledBy,
                          priority: detail.priority,
                          medium: detail.medium,
                        }}
                        onSubmit={saveTicketKopf}
                      />
                    ) : null}
                    {(id === "buchen" || id === "buchungen") && detail ? (
                      <MaringoTimekeepingPanel
                        ticketIssueId={detail.issueId}
                        ticketPanel={id === "buchen" ? "book" : "lines"}
                        bookDefaults={
                          id === "buchen"
                            ? {
                                issueId: detail.issueId,
                                projectNumber: detail.projectNumber,
                                projectLabel: detail.projectNumber
                              ? formatMariProjectLabel(
                                  detail.projectNumber,
                                  detail.addressMatchcode || detail.cardCode
                                )
                              : "",
                                contractId: detail.contractId,
                                contractPositionId: detail.contractPositionId,
                                activity: detail.briefDescription.slice(0, 100),
                                hours: 0.25,
                                billable: true,
                              }
                            : null
                        }
                        onTicketLinesChange={(lines) => {
                          setTicketTimeLines(lines);
                        }}
                      />
                    ) : null}
                    {id === "anzeige" ? (
                      <div className="space-y-3">
                        <p className="text-[12px] leading-relaxed text-muted-foreground">
                          Felder in der Ticketliste (Meta-Zeile). Vorhandene
                          Werte werden bei «Zeit buchen» vorbelegt und können
                          dort überschrieben werden.
                        </p>
                        <ul className="space-y-1.5">
                          {MARI_LIST_META_FIELD_OPTIONS.map((opt) => {
                            const checked = listMetaFields.includes(opt.id);
                            return (
                              <li key={opt.id}>
                                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5 hover:bg-muted/30">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={checked}
                                    onChange={() => {
                                      setListMetaFields((prev) => {
                                        if (prev.includes(opt.id)) {
                                          const next = prev.filter(
                                            (x) => x !== opt.id
                                          );
                                          return next.length > 0
                                            ? next
                                            : [...DEFAULT_MARI_LIST_META_FIELDS];
                                        }
                                        const order =
                                          MARI_LIST_META_FIELD_OPTIONS.map(
                                            (o) => o.id
                                          );
                                        return [...prev, opt.id].sort(
                                          (a, b) =>
                                            order.indexOf(a) - order.indexOf(b)
                                        );
                                      });
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-[13px] font-semibold">
                                      {opt.label}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground">
                                      {opt.hint}
                                    </span>
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </MariSecondaryFlyoutShell>
                );
              })}
            </div>,
            document.body
          )
        : null}

      <MaringoTimeBookDialog
        open={bookDialogOpen}
        onOpenChange={(open) => {
          setBookDialogOpen(open);
          if (!open) {
            setEditBookLineId(null);
            setEditBookDefaults(null);
            setPendingStampBook(null);
          }
        }}
        defaults={
          editBookDefaults ||
          (detail
            ? {
                issueId: detail.issueId,
                projectNumber: detail.projectNumber,
                projectLabel: detail.projectNumber
                              ? formatMariProjectLabel(
                                  detail.projectNumber,
                                  detail.addressMatchcode || detail.cardCode
                                )
                              : "",
                contractId: detail.contractId,
                contractPositionId: detail.contractPositionId,
                activity: detail.briefDescription.slice(0, 100),
                hours: 0.25,
                billable: true,
              }
            : null)
        }
        title={
          editBookLineId
            ? `Buchung ändern · #${editBookLineId}`
            : pendingStampBook
              ? `Stunden aus Termin · Ticket #${pendingStampBook.issueId}`
              : detail
                ? `Zeit buchen · Ticket #${detail.issueId}`
                : "Zeit buchen"
        }
        description={
          editBookLineId
            ? "Speichern ersetzt die Zeile in MARI. Ticket-Verknüpfung bleibt erhalten."
            : pendingStampBook
              ? "Vorschlag aus gestempeltem Ticket-Termin — prüfen und buchen."
              : "Buchung wird mit SourceReference auf dieses Ticket verknüpft."
        }
        submitLabel={editBookLineId ? "Speichern" : "Auf Ticket buchen"}
        editLineId={editBookLineId}
        onBooked={() => {
          const stamp = pendingStampBook;
          if (stamp) {
            void fetch("/api/maringo/timekeeping/suggestions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                eventProvider: stamp.eventProvider,
                eventId: stamp.eventId,
                status: "booked",
              }),
            }).catch(() => undefined);
          }
          setPendingStampBook(null);
          setSuggestionsRefresh((n) => n + 1);
          if (selectedId != null) void loadTicketTimeLines(selectedId);
        }}
      />

      <AdhocEventDialog
        open={ticketCalendarOpen}
        onOpenChange={setTicketCalendarOpen}
        mariIssueId={detail?.issueId ?? null}
        onCreated={() => {
          const id = detail?.issueId;
          void loadList();
          if (id == null) return;
          void (async () => {
            try {
              const res = await fetch(`/api/maringo/tickets/${id}`);
              const data = await res.json().catch(() => ({}));
              if (!res.ok) return;
              setTicketCalendarStamp(
                data.calendarStamp && typeof data.calendarStamp === "object"
                  ? (data.calendarStamp as MariCalendarStamp)
                  : null
              );
            } catch {
              /* optional */
            }
          })();
        }}
        initialTitle={
          detail
            ? `#${detail.issueId} · ${detail.briefDescription}`.slice(0, 200)
            : null
        }
        initialNotes={
          analysis?.summary?.trim() ||
          detail?.briefDescription ||
          null
        }
        defaultDurationMinutes={60}
        dialogTitle={
          detail ? `Termin · Ticket #${detail.issueId}` : "Termin aus Ticket"
        }
        dialogDescription="Freien Slot suchen, Termin anlegen — wird für die Abend-Stundenbuchung gestempelt."
      />
    </div>
  );
}
