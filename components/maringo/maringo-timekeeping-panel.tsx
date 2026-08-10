"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import type { MariTimeLine } from "@/lib/mari/timekeeping";
import {
  MaringoTimeBookForm,
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

export function MaringoTimekeepingPanel({
  className,
}: {
  className?: string;
}) {
  const [date, setDate] = useState(zurichTodayYmd);
  const [lines, setLines] = useState<MariTimeLine[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [billableHours, setBillableHours] = useState(0);
  const [nonBillableHours, setNonBillableHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const loadDay = useCallback(async (ymd: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/maringo/timekeeping/day?date=${encodeURIComponent(ymd)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Tagesbuchungen laden fehlgeschlagen");
      setLines((data.lines || []) as MariTimeLine[]);
      setTotalHours(Number(data.totalHours) || 0);
      setBillableHours(Number(data.billableHours) || 0);
      setNonBillableHours(Number(data.nonBillableHours) || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDay(date);
  }, [date, loadDay]);

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
    await loadDay(values.dayOfService);
  }

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
            <div className="flex flex-wrap items-end justify-between gap-2">
              <CardTitle className="text-sm">Tagesübersicht</CardTitle>
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label htmlFor="tk-day" className="sr-only">
                    Tag
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
                  onClick={() => void loadDay(date)}
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
              emptyText={
                loading ? "Lade Buchungen…" : "Keine Buchungen an diesem Tag."
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
