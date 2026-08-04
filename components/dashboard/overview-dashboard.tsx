"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Mail,
  Briefcase,
  Shield,
  ChartColumnIncreasing,
  Clock3,
  HandCoins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackupStatusPanel } from "@/components/settings/backup-status-panel";
import { KpiCorrectSheet } from "@/components/dashboard/kpi-correct-sheet";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type {
  AgendaItem,
  AgendaKind,
  OverviewPayload,
  OverviewPeriod,
} from "@/lib/dashboard/overview";

const PERIODS: { id: OverviewPeriod; label: string }[] = [
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "quarter", label: "Quartal" },
  { id: "half", label: "Halbjahr" },
  { id: "year", label: "Jahr" },
];

const KIND_ACCENT: Record<AgendaKind, string> = {
  invoice: "border-l-[var(--brand-finance)]",
  deadline: "border-l-teal-600",
  travel: "border-l-sky-600",
  warranty: "border-l-amber-600",
  triage: "border-l-[var(--brand-docs)]",
  ledger: "border-l-[var(--brand-finance)]",
};

const KIND_ICON: Record<AgendaKind, typeof FileText> = {
  invoice: FileText,
  deadline: Clock3,
  travel: Briefcase,
  warranty: Shield,
  triage: Mail,
  ledger: HandCoins,
};

function weekdayLabel(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("de-CH", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function AgendaRow({ item }: { item: AgendaItem }) {
  const Icon = KIND_ICON[item.kind];
  const inner = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border/60 border-l-4 bg-card px-3 py-2.5 shadow-[0_2px_10px_rgba(20,32,28,0.04)]",
        KIND_ACCENT[item.kind]
      )}
    >
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        strokeWidth={APP_ICON_STROKE}
        absoluteStrokeWidth
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        {item.subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.amount != null ? (
          <span className="text-sm font-semibold tabular-nums">
            {formatCHF(item.amount, item.currency || "CHF")}
          </span>
        ) : null}
        <Badge variant="secondary" className="text-[10px]">
          {item.badge}
        </Badge>
      </div>
    </div>
  );

  const linkHref =
    item.href ||
    (item.documentId != null ? `/documents/${item.documentId}` : null);
  if (linkHref) {
    return (
      <Link href={linkHref} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function OverviewDashboard({
  greetingName,
}: {
  greetingName: string | null;
}) {
  const [period, setPeriod] = useState<OverviewPeriod>("month");
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/overview?period=${encodeURIComponent(period)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json as OverviewPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of data?.agenda || []) {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data?.agenda]);

  const hour = new Date().getHours();
  const greeting =
    hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

  const kpiMax = Math.max(
    ...(data?.kpi.byCategory.map((c) => c.total) || [1]),
    1
  );

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{greeting}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greetingName || "Übersicht"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={period === p.id ? "default" : "outline"}
              className={cn(
                period === p.id &&
                  "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
              )}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {data ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inbox"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-muted/40"
          >
            <CalendarDays className="size-3.5 text-muted-foreground" strokeWidth={APP_ICON_STROKE} absoluteStrokeWidth aria-hidden />
            Heute
          </Link>
          <Link
            href="/inbox"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-muted/40"
          >
            <Mail className="size-3.5 text-[var(--brand-docs)]" strokeWidth={APP_ICON_STROKE} absoluteStrokeWidth aria-hidden />
            {data.chips.triagePending} Triage
          </Link>
          <Link
            href="/deadlines"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-muted/40"
          >
            <Clock3 className="size-3.5 text-teal-700" strokeWidth={APP_ICON_STROKE} absoluteStrokeWidth aria-hidden />
            {data.chips.urgentDeadlines} Fristen
          </Link>
          <Link
            href="/finance"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-muted/40"
          >
            <ChartColumnIncreasing className="size-3.5 text-[var(--brand-finance)]" strokeWidth={APP_ICON_STROKE} absoluteStrokeWidth aria-hidden />
            {formatCHF(data.chips.openDueAmount)} offen
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading && !data ? (
        <p className="text-sm text-muted-foreground">Lade Übersicht…</p>
      ) : data ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
          <section className="min-w-0 space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold capitalize">
                {data.rangeLabel}
              </h2>
              <span className="text-xs text-muted-foreground">
                {toSwissDate(data.rangeStart)} – {toSwissDate(data.rangeEnd)}
              </span>
            </div>
            {grouped.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Keine relevanten Belege in diesem Zeitraum.
                </CardContent>
              </Card>
            ) : (
              grouped.map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {weekdayLabel(date)}
                  </p>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <AgendaRow key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          <aside className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Kennzahlen · {PERIODS.find((p) => p.id === period)?.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatCHF(data.kpi.total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ausgaben nach Kategorie (in Statistik)
                </p>
                <div className="space-y-2">
                  {data.kpi.byCategory.slice(0, 6).map((slice) => (
                    <div key={slice.category} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate">{slice.category}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCHF(slice.total)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[var(--brand-finance)]"
                          style={{
                            width: `${Math.max(6, (slice.total / kpiMax) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {data.kpi.byCategory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Keine Ausgaben in diesem Zeitraum.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCorrectOpen(true)}
                  >
                    Kennzahlen korrigieren
                  </Button>
                  <Link
                    href="/finance"
                    className="inline-flex h-8 items-center text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                  >
                    Zur Ausgabenanalyse →
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Kommende 14 Tage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.upcoming14.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine anstehenden Fristen.
                  </p>
                ) : (
                  data.upcoming14.map((item) => (
                    <AgendaRow key={item.id} item={item} />
                  ))
                )}
                <Link
                  href="/deadlines"
                  className="inline-flex text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Alle Fristen anzeigen →
                </Link>
              </CardContent>
            </Card>

            <BackupStatusPanel />
          </aside>
        </div>
      ) : null}

      <KpiCorrectSheet
        open={correctOpen}
        onOpenChange={setCorrectOpen}
        items={data?.financeItems || []}
        onSaved={() => void load()}
      />
    </div>
  );
}
