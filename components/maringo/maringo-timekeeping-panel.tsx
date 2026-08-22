"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import {
  formatPeriodLabel,
  formatMariProjectLabel,
  resolveTimePeriodRange,
  shiftTimePeriodAnchor,
  type MariTimeLine,
  type MariTimePeriod,
} from "@/lib/mari/timekeeping-shared";
import {
  MaringoTimeBookForm,
  type TimeBookFormDefaults,
  type TimeBookFormValues,
} from "@/components/maringo/maringo-time-book-form";
import { MaringoTimeLinesTable } from "@/components/maringo/maringo-time-lines-table";
import { MariHoursSplitSummary } from "@/components/maringo/mari-hours-split-summary";
import {
  MariSecondaryFlyoutShell,
  MARI_FLYOUT_MS,
  useFlyoutPresence,
} from "@/components/maringo/maringo-flyout-chrome";

function zurichTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const PERIOD_OPTIONS: { id: MariTimePeriod; label: string }[] = [
  { id: "day", label: "Tag" },
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "quarter", label: "Quartal" },
];

export type MariTicketTimePanel = "book" | "lines" | "both";

export function MaringoTimekeepingPanel({
  className,
  /** Ticket-Kontext: Formular und/oder nur Buchungen dieses Tickets (keine Tagesübersicht). */
  ticketIssueId = null,
  /** Bei Ticket: nur Maske, nur Übersicht, oder beides. */
  ticketPanel = "both",
  bookDefaults = null,
  onTicketLinesChange,
}: {
  className?: string;
  ticketIssueId?: number | null;
  ticketPanel?: MariTicketTimePanel;
  bookDefaults?: TimeBookFormDefaults | null;
  onTicketLinesChange?: (lines: MariTimeLine[]) => void;
}) {
  const ticketMode = ticketIssueId != null && ticketIssueId > 0;
  const showBookForm = ticketMode && ticketPanel !== "lines";
  const showLinesOverview = !ticketMode || ticketPanel !== "book";
  const dayOverview = !ticketMode;
  const [date, setDate] = useState(zurichTodayYmd);
  const [period, setPeriod] = useState<MariTimePeriod>("day");
  const [fromDate, setFromDate] = useState(date);
  const [toDate, setToDate] = useState(date);
  const [lines, setLines] = useState<MariTimeLine[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [billableHours, setBillableHours] = useState(0);
  const [nonBillableHours, setNonBillableHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busyLineId, setBusyLineId] = useState<number | null>(null);
  const [editLine, setEditLine] = useState<MariTimeLine | null>(null);
  const [editDefaults, setEditDefaults] = useState<TimeBookFormDefaults | null>(
    null
  );
  const [editLoading, setEditLoading] = useState(false);
  const [bookFlyoutOpen, setBookFlyoutOpen] = useState(false);
  const [flyoutPortalReady, setFlyoutPortalReady] = useState(false);
  const [duplicateDefaults, setDuplicateDefaults] =
    useState<TimeBookFormDefaults | null>(null);
  const bookFlyoutPresence = useFlyoutPresence(bookFlyoutOpen);

  const onTicketLinesChangeRef = useRef(onTicketLinesChange);
  useEffect(() => {
    onTicketLinesChangeRef.current = onTicketLinesChange;
  }, [onTicketLinesChange]);

  useEffect(() => {
    setFlyoutPortalReady(true);
  }, []);

  useEffect(() => {
    if (!bookFlyoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[data-slot="dialog-overlay"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setBookFlyoutOpen(false);
      setDuplicateDefaults(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [bookFlyoutOpen]);

  const periodHint = useMemo(() => {
    try {
      const range = resolveTimePeriodRange(date, period);
      return formatPeriodLabel(period, range.fromDate, range.toDate);
    } catch {
      return "";
    }
  }, [date, period]);

  const applyLines = useCallback((next: MariTimeLine[]) => {
    setLines(next);
    const total =
      Math.round(next.reduce((s, l) => s + l.hours, 0) * 100) / 100;
    const billable =
      Math.round(next.reduce((s, l) => s + l.hoursBillable, 0) * 100) / 100;
    setTotalHours(total);
    setBillableHours(billable);
    setNonBillableHours(Math.round((total - billable) * 100) / 100);
    onTicketLinesChangeRef.current?.(next);
  }, []);

  const loadPeriod = useCallback(async (ymd: string, p: MariTimePeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/maringo/timekeeping/day?date=${encodeURIComponent(ymd)}&period=${p}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Buchungen laden fehlgeschlagen");
      }
      setLines((data.lines || []) as MariTimeLine[]);
      setTotalHours(Number(data.totalHours) || 0);
      setBillableHours(Number(data.billableHours) || 0);
      setNonBillableHours(Number(data.nonBillableHours) || 0);
      setFromDate(String(data.fromDate || ymd));
      setToDate(String(data.toDate || ymd));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTicketLines = useCallback(
    async (issueId: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/maringo/timekeeping/by-ticket?issueId=${issueId}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || "Ticket-Buchungen laden fehlgeschlagen"
          );
        }
        applyLines((data.lines || []) as MariTimeLine[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        applyLines([]);
      } finally {
        setLoading(false);
      }
    },
    [applyLines]
  );

  const reload = useCallback(async () => {
    if (ticketMode && ticketIssueId != null) {
      await loadTicketLines(ticketIssueId);
      return;
    }
    await loadPeriod(date, period);
  }, [ticketMode, ticketIssueId, loadTicketLines, loadPeriod, date, period]);

  useEffect(() => {
    if (ticketMode && ticketIssueId != null) {
      // Book-only flyout: lines load after submit via reload(); overview flyout loads here.
      if (ticketPanel === "book") return;
      void loadTicketLines(ticketIssueId);
      return;
    }
    void loadPeriod(date, period);
    // loadTicketLines/loadPeriod are stable; avoid re-fetch loops from parent callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketMode, ticketIssueId, ticketPanel, date, period]);

  async function book(values: TimeBookFormValues) {
    setStatus(null);
    setError(null);
    const payload = {
      ...values,
      issueId: ticketMode ? ticketIssueId : values.issueId,
    };
    const res = await fetch("/api/maringo/timekeeping/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Buchung fehlgeschlagen");
    const line = data.line as MariTimeLine | undefined;
    const warn =
      (line?.warning || "").trim() ||
      (typeof data.warning === "string" ? data.warning.trim() : "");
    const wasDuplicate = duplicateDefaults != null;
    setStatus(
      [
        `${wasDuplicate ? "Dupliziert" : "Gebucht"}: ${values.hours} h auf ${formatMariProjectLabel(
          values.projectNumber,
          values.projectLabel
        )}` +
          (payload.issueId ? ` (Ticket #${payload.issueId})` : "") +
          (line?.lineId ? ` · #${line.lineId}` : ""),
        warn ? `Hinweis: ${warn}` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    );
    setDuplicateDefaults(null);
    setBookFlyoutOpen(false);
    setFormKey((k) => k + 1);
    if (!ticketMode) setDate(values.dayOfService);
    await reload();
  }

  async function fetchLineFormDefaults(
    line: MariTimeLine
  ): Promise<TimeBookFormDefaults> {
    const res = await fetch(`/api/maringo/timekeeping/lines/${line.lineId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Buchung laden fehlgeschlagen");
    const full = data.line as {
      serviceDate: string;
      projectNumber: string;
      activity: string;
      memo: string | null;
      hours: number;
      hoursBillable: number;
      billable: boolean;
      contractId: number;
      contractPositionId: number;
      issueId: number | null;
      internalRemarkVerr?: string | null;
      zeroHoursReason?: string | null;
    };
    return {
      dayOfService: full.serviceDate || line.serviceDate,
      projectNumber: full.projectNumber || line.projectNumber,
      projectLabel: formatMariProjectLabel(
        full.projectNumber || line.projectNumber,
        line.projectCustomer
      ),
      contractId: full.contractId || null,
      contractPositionId: full.contractPositionId || null,
      activity: full.activity || line.activity,
      memoText: full.memo || line.memo || "",
      hours: full.hours ?? line.hours,
      hoursBillable: full.hoursBillable ?? line.hoursBillable,
      billable: full.billable ?? line.billable,
      issueId: full.issueId ?? (ticketMode ? ticketIssueId : null),
      internalRemarkVerr: full.internalRemarkVerr ?? line.internalRemarkVerr,
      zeroHoursReason: full.zeroHoursReason ?? line.zeroHoursReason,
    };
  }

  async function openEdit(line: MariTimeLine) {
    if (line.approved) {
      setError("Freigegebene Buchungen können nicht geändert werden.");
      return;
    }
    setError(null);
    setEditLine(line);
    setEditDefaults(null);
    setEditLoading(true);
    try {
      setEditDefaults(await fetchLineFormDefaults(line));
    } catch (err) {
      setEditLine(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditLoading(false);
    }
  }

  async function openDuplicate(line: MariTimeLine) {
    if (line.lineId <= 0) return;
    setError(null);
    setBusyLineId(line.lineId);
    try {
      const defaults = await fetchLineFormDefaults(line);
      setDuplicateDefaults(defaults);
      setFormKey((k) => k + 1);
      if (dayOverview || !showBookForm) {
        setBookFlyoutOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLineId(null);
    }
  }

  function closeBookFlyout() {
    setBookFlyoutOpen(false);
    setDuplicateDefaults(null);
  }

  async function saveEdit(values: TimeBookFormValues) {
    if (!editLine) return;
    setStatus(null);
    setError(null);
    const res = await fetch(
      `/api/maringo/timekeeping/lines/${editLine.lineId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          issueId: ticketMode ? ticketIssueId : values.issueId,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Änderung fehlgeschlagen");
    const line = data.line as MariTimeLine | undefined;
    setStatus(
      `Geändert: ${values.hours} h auf ${formatMariProjectLabel(
        values.projectNumber,
        values.projectLabel
      )}` + (line?.lineId ? ` · #${line.lineId}` : "")
    );
    setEditLine(null);
    setEditDefaults(null);
    if (!ticketMode) setDate(values.dayOfService);
    await reload();
  }

  async function removeLine(line: MariTimeLine) {
    if (line.approved) {
      setError("Freigegebene Buchungen können nicht gelöscht werden.");
      return;
    }
    if (
      !window.confirm(
        `Buchung #${line.lineId} (${line.hours} h, ${formatMariProjectLabel(
          line.projectNumber,
          line.projectCustomer
        )}) wirklich löschen?`
      )
    ) {
      return;
    }
    setBusyLineId(line.lineId);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/timekeeping/lines/${line.lineId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setStatus(`Gelöscht: Buchung #${line.lineId}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLineId(null);
    }
  }

  const overviewTitle = ticketMode
    ? "Buchungen zu diesem Ticket"
    : period === "day"
      ? "Tagesübersicht"
      : period === "week"
        ? "Wochenübersicht"
        : period === "month"
          ? "Monatsübersicht"
          : "Quartalsübersicht";

  const formDefaults: TimeBookFormDefaults = {
    dayOfService: date,
    hours: 0.25,
    billable: true,
    ...(bookDefaults || {}),
    ...(duplicateDefaults || {}),
    ...(ticketMode
      ? {
          issueId: ticketIssueId,
        }
      : {}),
  };
  const isDuplicateMode = duplicateDefaults != null;
  const bookSubmitLabel = isDuplicateMode
    ? "Duplikat buchen"
    : ticketMode
      ? "Auf Ticket buchen"
      : "Buchen";

  return (
    <div className={cn("space-y-4", className)}>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {status && !dayOverview ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100">
          {status}
        </p>
      ) : null}

      <div className="space-y-4">
        {showBookForm ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock3 className="size-4" strokeWidth={APP_ICON_STROKE} />
                {`Zeit auf Ticket #${ticketIssueId} buchen`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MaringoTimeBookForm
                key={`${formKey}-${ticketIssueId || "day"}`}
                defaults={formDefaults}
                onSubmit={book}
                layout="compact"
                submitLabel={bookSubmitLabel}
              />
            </CardContent>
          </Card>
        ) : null}

        {showLinesOverview ? (
          dayOverview ? (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
              <div className="space-y-2.5 border-b border-border/50 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-black tracking-tight">
                      {overviewTitle}
                    </h2>
                    {periodHint ? (
                      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                        {periodHint}
                        {fromDate !== toDate
                          ? ` · ${lines.length} Buchungen`
                          : loading
                            ? " · Lade…"
                            : ` · ${lines.length} Buchung${lines.length === 1 ? "" : "en"}`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() =>
                          setDate(shiftTimePeriodAnchor(date, period, -1))
                        }
                        aria-label={
                          period === "day"
                            ? "Vorheriger Tag"
                            : period === "week"
                              ? "Vorherige Woche"
                              : period === "month"
                                ? "Vorheriger Monat"
                                : "Vorheriges Quartal"
                        }
                      >
                        <ChevronLeft
                          className="size-4"
                          strokeWidth={APP_ICON_STROKE}
                        />
                      </Button>
                      <div className="space-y-1">
                        <Label htmlFor="tk-day" className="sr-only">
                          Ankerdatum
                        </Label>
                        <Input
                          id="tk-day"
                          type="date"
                          className="h-8 w-auto"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() =>
                          setDate(shiftTimePeriodAnchor(date, period, 1))
                        }
                        aria-label={
                          period === "day"
                            ? "Nächster Tag"
                            : period === "week"
                              ? "Nächste Woche"
                              : period === "month"
                                ? "Nächster Monat"
                                : "Nächstes Quartal"
                        }
                      >
                        <ChevronRight
                          className="size-4"
                          strokeWidth={APP_ICON_STROKE}
                        />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void reload()}
                      disabled={loading}
                      aria-label="Aktualisieren"
                    >
                      <RefreshCw
                        className={cn("size-4", loading && "animate-spin")}
                        strokeWidth={APP_ICON_STROKE}
                      />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-orange-500 text-white hover:bg-orange-600"
                      onClick={() => {
                        setDuplicateDefaults(null);
                        setBookFlyoutOpen(true);
                      }}
                    >
                      <Plus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                      Stunden buchen
                    </Button>
                  </div>
                </div>

                <div
                  className="inline-flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
                  role="group"
                  aria-label="Zeitraum"
                >
                  {PERIOD_OPTIONS.map((opt) => (
                    <Button
                      key={opt.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-auto rounded-md px-2.5 py-1 text-xs font-medium",
                        period === opt.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      aria-pressed={period === opt.id}
                      onClick={() => setPeriod(opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>

                <MariHoursSplitSummary
                  totalHours={totalHours}
                  billableHours={billableHours}
                  nonBillableHours={nonBillableHours}
                  footnote={
                    loading
                      ? "Lade Buchungen…"
                      : periodHint
                        ? `${lines.length} Buchung${lines.length === 1 ? "" : "en"} · ${periodHint}`
                        : `${lines.length} Buchung${lines.length === 1 ? "" : "en"}`
                  }
                  totalHint="Zeitraum"
                />
              </div>

              <div className="px-3 py-2.5">
                <MaringoTimeLinesTable
                  lines={lines}
                  totalHours={totalHours}
                  billableHours={billableHours}
                  nonBillableHours={nonBillableHours}
                  summaryVariant="none"
                  variant="table"
                  emptyText={
                    loading
                      ? "Lade Buchungen…"
                      : period === "day"
                        ? "Keine Buchungen an diesem Tag."
                        : "Keine Buchungen in diesem Zeitraum."
                  }
                  onEdit={(l) => void openEdit(l)}
                  onDuplicate={(l) => void openDuplicate(l)}
                  onDelete={removeLine}
                  busyLineId={busyLineId}
                />
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{overviewTitle}</CardTitle>
                      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                        {loading
                          ? "Lade…"
                          : `${lines.length} Buchung${lines.length === 1 ? "" : "en"}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void reload()}
                      disabled={loading}
                      aria-label="Aktualisieren"
                    >
                      <RefreshCw
                        className={cn("size-4", loading && "animate-spin")}
                        strokeWidth={APP_ICON_STROKE}
                      />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <MaringoTimeLinesTable
                  lines={lines}
                  totalHours={totalHours}
                  billableHours={billableHours}
                  nonBillableHours={nonBillableHours}
                  summaryVariant="chart"
                  emptyText={
                    loading
                      ? "Lade Buchungen…"
                      : "Noch keine Stundenbuchungen auf dieses Ticket."
                  }
                  onEdit={(l) => void openEdit(l)}
                  onDuplicate={(l) => void openDuplicate(l)}
                  onDelete={removeLine}
                  busyLineId={busyLineId}
                />
              </CardContent>
            </Card>
          )
        ) : null}
      </div>

      {flyoutPortalReady && bookFlyoutPresence.mounted
        ? createPortal(
            <div className="fixed inset-0 z-[1000]">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "absolute inset-0 h-auto w-full rounded-none border-0 bg-black/20 p-0 transition-opacity ease-in-out hover:bg-black/20",
                  bookFlyoutPresence.entered ? "opacity-100" : "opacity-0"
                )}
                style={{ transitionDuration: `${MARI_FLYOUT_MS}ms` }}
                aria-label="Flyout schliessen"
                onClick={closeBookFlyout}
              />
              <MariSecondaryFlyoutShell
                title={
                  isDuplicateMode ? "Buchung duplizieren" : "Stundenbuchung"
                }
                description={
                  isDuplicateMode
                    ? "Datum und Stunden anpassen, dann speichern"
                    : "Neue Zeit erfassen"
                }
                onClose={closeBookFlyout}
                widthClass="w-[min(100%,34rem)]"
                zIndex={1010}
                offsetPx={0}
                open={bookFlyoutPresence.entered}
              >
                {status ? (
                  <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100">
                    {status}
                  </p>
                ) : null}
                {error ? (
                  <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
                    {error}
                  </p>
                ) : null}
                <MaringoTimeBookForm
                  key={`${formKey}-day-flyout`}
                  defaults={formDefaults}
                  onSubmit={book}
                  layout="compact"
                  submitLabel={bookSubmitLabel}
                />
              </MariSecondaryFlyoutShell>
            </div>,
            document.body
          )
        : null}

      <Dialog
        open={editLine != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditLine(null);
            setEditDefaults(null);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Buchung ändern
              {editLine ? ` · #${editLine.lineId}` : ""}
            </DialogTitle>
            <DialogDescription>
              Speichern ersetzt die Zeile in MARI (löschen + neu anlegen).
              Ticket-Verknüpfung bleibt erhalten.
            </DialogDescription>
          </DialogHeader>
          {editLoading || !editDefaults ? (
            <p className="text-sm text-muted-foreground">Lade Buchung…</p>
          ) : (
            <MaringoTimeBookForm
              key={`edit-${editLine?.lineId}`}
              defaults={editDefaults}
              submitLabel="Speichern"
              onSubmit={saveEdit}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
