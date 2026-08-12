"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import type { TimeBookFormDefaults } from "@/components/maringo/maringo-time-book-form";

export type MariTimeSuggestion = {
  eventProvider: "microsoft" | "google";
  eventId: string;
  calendarId: string | null;
  issueId: number;
  eventDate: string;
  startHm: string | null;
  endHm: string | null;
  title: string;
  memo: string | null;
  hours: number | null;
  href: string;
};

export function MaringoTimeSuggestionsPanel({
  className,
  onBookSuggestion,
  refreshKey = 0,
}: {
  className?: string;
  /** Open time-book dialog prefilled from this stamp. */
  onBookSuggestion?: (suggestion: MariTimeSuggestion) => void;
  /** Bump to reload pending suggestions. */
  refreshKey?: number;
}) {
  const [items, setItems] = useState<MariTimeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/maringo/timekeeping/suggestions");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Vorschläge laden fehlgeschlagen");
      }
      setItems((data.suggestions || []) as MariTimeSuggestion[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function dismiss(s: MariTimeSuggestion) {
    const key = `${s.eventProvider}:${s.eventId}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/maringo/timekeeping/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventProvider: s.eventProvider,
          eventId: s.eventId,
          status: "dismissed",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Verwerfen fehlgeschlagen");
      setItems((prev) =>
        prev.filter(
          (x) =>
            !(x.eventProvider === s.eventProvider && x.eventId === s.eventId)
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading && items.length === 0) {
    return (
      <Card className={cn("border-border/60", className)}>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Abend-Vorschläge laden…
        </CardContent>
      </Card>
    );
  }

  if (!items.length && !error) {
    return null;
  }

  return (
    <Card className={cn("border-orange-200/70 bg-orange-50/30 dark:border-orange-400/30 dark:bg-orange-500/10", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[15px] font-black tracking-tight">
          <CalendarClock
            className="size-4 text-orange-800 dark:text-orange-300"
            strokeWidth={APP_ICON_STROKE}
            absoluteStrokeWidth
            aria-hidden
          />
          Stunden aus Ticket-Terminen
          {items.length ? (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              {items.length}
            </span>
          ) : null}
        </CardTitle>
        <p className="text-[12px] text-muted-foreground">
          Gestempelte Kalendertermine aus Maringo — prüfen und buchen.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
        <ul className="space-y-2">
          {items.map((s) => {
            const key = `${s.eventProvider}:${s.eventId}`;
            const busy = busyKey === key;
            return (
              <li
                key={key}
                className="rounded-xl border border-orange-200/60 bg-white/70 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold tracking-tight">
                      {s.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      #{s.issueId} · {s.eventDate}
                      {s.startHm && s.endHm
                        ? ` · ${s.startHm}–${s.endHm}`
                        : ""}
                      {s.hours != null ? ` · ${s.hours} h` : ""}
                      {` · ${s.eventProvider === "google" ? "Google" : "Outlook"}`}
                    </p>
                    {s.memo ? (
                      <p className="mt-1 line-clamp-2 text-[12px] text-foreground/80">
                        {s.memo}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1 bg-orange-500 text-white hover:bg-orange-600"
                      disabled={busy}
                      onClick={() => onBookSuggestion?.(s)}
                    >
                      <Check className="size-3.5" aria-hidden />
                      Buchen
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy}
                      onClick={() => void dismiss(s)}
                    >
                      <X className="size-3.5" aria-hidden />
                      Später
                    </Button>
                    <Link
                      href={s.href}
                      className="inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    >
                      Ticket
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => void load()}
            disabled={loading}
          >
            Aktualisieren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Map a calendar stamp suggestion into time-book form defaults. */
export function suggestionToBookDefaults(
  s: MariTimeSuggestion,
  ticket?: {
    projectNumber?: string | null;
    projectLabel?: string | null;
    contractId?: number | null;
    contractPositionId?: number | null;
    activity?: string | null;
  } | null
): TimeBookFormDefaults {
  const memo =
    s.memo?.replace(/\[\[buddy:mari:\d+\]\]/gi, "").trim() ||
    s.title;
  return {
    dayOfService: s.eventDate,
    issueId: s.issueId,
    projectNumber: ticket?.projectNumber ?? null,
    projectLabel: ticket?.projectLabel ?? null,
    contractId: ticket?.contractId ?? null,
    contractPositionId: ticket?.contractPositionId ?? null,
    activity: (ticket?.activity || s.title).slice(0, 100),
    memoText: memo.slice(0, 500),
    hours: s.hours && s.hours > 0 ? s.hours : 0.25,
    hoursBillable: s.hours && s.hours > 0 ? s.hours : 0.25,
    billable: true,
  };
}
