"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
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
  resolveTimePeriodRange,
  type MariTimeLine,
  type MariTimePeriod,
} from "@/lib/mari/timekeeping-shared";
import {
  MaringoTimeBookForm,
  type TimeBookFormDefaults,
  type TimeBookFormValues,
} from "@/components/maringo/maringo-time-book-form";
import { MaringoTimeLinesTable } from "@/components/maringo/maringo-time-lines-table";

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

export function MaringoTimekeepingPanel({
  className,
}: {
  className?: string;
}) {
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

  const periodHint = useMemo(() => {
    try {
      const range = resolveTimePeriodRange(date, period);
      return formatPeriodLabel(period, range.fromDate, range.toDate);
    } catch {
      return "";
    }
  }, [date, period]);

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

  useEffect(() => {
    void loadPeriod(date, period);
  }, [date, period, loadPeriod]);

  async function book(values: TimeBookFormValues) {
    setStatus(null);
    setError(null);
    const res = await fetch("/api/maringo/timekeeping/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Buchung fehlgeschlagen");
    const line = data.line as MariTimeLine | undefined;
    const warn =
      (line?.warning || "").trim() ||
      (typeof data.warning === "string" ? data.warning.trim() : "");
    setStatus(
      [
        `Gebucht: ${values.hours} h auf ${values.projectNumber}` +
          (values.issueId ? ` (Ticket #${values.issueId})` : "") +
          (line?.lineId ? ` · #${line.lineId}` : ""),
        warn ? `Hinweis: ${warn}` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    );
    setFormKey((k) => k + 1);
    setDate(values.dayOfService);
    await loadPeriod(values.dayOfService, period);
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
      };
      setEditDefaults({
        dayOfService: full.serviceDate || line.serviceDate,
        projectNumber: full.projectNumber || line.projectNumber,
        projectLabel: full.projectNumber || line.projectNumber,
        contractId: full.contractId || null,
        contractPositionId: full.contractPositionId || null,
        activity: full.activity || line.activity,
        memoText: full.memo || line.memo || "",
        hours: full.hours ?? line.hours,
        hoursBillable: full.hoursBillable ?? line.hoursBillable,
        billable: full.billable ?? line.billable,
        issueId: full.issueId,
      });
    } catch (err) {
      setEditLine(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditLoading(false);
    }
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
        body: JSON.stringify(values),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Änderung fehlgeschlagen");
    const line = data.line as MariTimeLine | undefined;
    setStatus(
      `Geändert: ${values.hours} h auf ${values.projectNumber}` +
        (line?.lineId ? ` · #${line.lineId}` : "")
    );
    setEditLine(null);
    setEditDefaults(null);
    setDate(values.dayOfService);
    await loadPeriod(values.dayOfService, period);
  }

  async function removeLine(line: MariTimeLine) {
    if (line.approved) {
      setError("Freigegebene Buchungen können nicht gelöscht werden.");
      return;
    }
    if (
      !window.confirm(
        `Buchung #${line.lineId} (${line.hours} h, ${line.projectNumber}) wirklich löschen?`
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
      await loadPeriod(date, period);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLineId(null);
    }
  }

  const overviewTitle =
    period === "day"
      ? "Tagesübersicht"
      : period === "week"
        ? "Wochenübersicht"
        : period === "month"
          ? "Monatsübersicht"
          : "Quartalsübersicht";

  return (
    <div className={cn("space-y-4", className)}>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-rose-950">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-emerald-950">
          {status}
        </p>
      ) : null}

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock3 className="size-4" strokeWidth={APP_ICON_STROKE} />
              Neue Stundenbuchung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MaringoTimeBookForm
              key={formKey}
              defaults={{ dayOfService: date, hours: 0.25, billable: true }}
              onSubmit={book}
              layout="wide"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">{overviewTitle}</CardTitle>
                  {periodHint ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {periodHint}
                      {fromDate !== toDate
                        ? ` · ${lines.length} Buchungen`
                        : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                    className="size-8"
                    onClick={() => void loadPeriod(date, period)}
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
              <div
                className="inline-flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
                role="group"
                aria-label="Zeitraum"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                      period === opt.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-pressed={period === opt.id}
                    onClick={() => setPeriod(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MaringoTimeLinesTable
              lines={lines}
              totalHours={totalHours}
              billableHours={billableHours}
              nonBillableHours={nonBillableHours}
              emptyText={
                loading
                  ? "Lade Buchungen…"
                  : period === "day"
                    ? "Keine Buchungen an diesem Tag."
                    : "Keine Buchungen in diesem Zeitraum."
              }
              onEdit={(l) => void openEdit(l)}
              onDelete={removeLine}
              busyLineId={busyLineId}
            />
          </CardContent>
        </Card>
      </div>

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
