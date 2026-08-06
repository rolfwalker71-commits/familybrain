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
  Goal,
  Trophy,
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
  HockeyGameCard,
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
  hockey: "border-l-rose-600",
};

const KIND_ICON: Record<AgendaKind, typeof FileText> = {
  invoice: FileText,
  deadline: Clock3,
  travel: Briefcase,
  warranty: Shield,
  triage: Mail,
  ledger: HandCoins,
  hockey: Goal,
};

function TeamLogo({
  label,
  src,
  size = "sm",
}: {
  label: string;
  src: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const box =
    size === "lg" ? "size-16" : size === "md" ? "size-11" : "size-8";
  if (!src || failed) {
    return (
      <span
        className={cn(
          box,
          "flex shrink-0 items-center justify-center rounded-full bg-rose-50 text-[10px] font-bold uppercase text-rose-700"
        )}
        aria-hidden
        title={label}
      >
        {label.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      title={label}
      className={cn(box, "shrink-0 rounded-full bg-white object-contain p-0.5")}
      onError={() => setFailed(true)}
    />
  );
}

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

function AgendaRow({
  item,
  variant = "agenda",
}: {
  item: AgendaItem;
  /** upcoming: hockey shows date+time / location / Heim|Auswärts on three lines */
  variant?: "agenda" | "upcoming";
}) {
  const Icon = KIND_ICON[item.kind];
  const isPaymentPipeline = item.badge === "Zahlung";
  const isHockey = item.kind === "hockey";
  const hasLogos = Boolean(item.logos?.left || item.logos?.right);
  const upcomingHockey = isHockey && hasLogos && variant === "upcoming";

  let hockeyDateLabel = item.date;
  try {
    hockeyDateLabel = new Date(`${item.date}T12:00:00`).toLocaleDateString(
      "de-CH",
      {
        weekday: "short",
        day: "numeric",
        month: "short",
      }
    );
  } catch {
    /* keep iso */
  }

  const upcomingLine1 = [hockeyDateLabel, item.time, item.score]
    .filter(Boolean)
    .join(" · ");
  const upcomingLine2 = item.location || null;
  const upcomingLine3 = item.title;

  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/60 border-l-4 bg-card px-3 py-2.5 shadow-[0_2px_10px_rgba(20,32,28,0.04)]",
        isPaymentPipeline
          ? "border-l-sky-500 bg-sky-50/40"
          : KIND_ACCENT[item.kind]
      )}
    >
      <Icon
        className="size-8 shrink-0 text-muted-foreground"
        strokeWidth={APP_ICON_STROKE}
        absoluteStrokeWidth
        aria-hidden
      />
      {isHockey && hasLogos ? (
        <div className="flex shrink-0 items-center gap-1" aria-hidden>
          <TeamLogo
            label={item.logos?.leftLabel || "Heim"}
            src={item.logos?.left}
            size="md"
          />
          <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            vs.
          </span>
          <TeamLogo
            label={item.logos?.rightLabel || "Gast"}
            src={item.logos?.right}
            size="md"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {upcomingHockey ? (
          <>
            <p className="truncate text-sm font-medium text-foreground">
              {upcomingLine1}
            </p>
            {upcomingLine2 ? (
              <p className="truncate text-xs text-muted-foreground">
                {upcomingLine2}
              </p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">
              {upcomingLine3}
            </p>
          </>
        ) : isHockey && hasLogos ? (
          <>
            {item.subtitle ? (
              <p className="truncate text-sm font-medium text-foreground">
                {item.subtitle}
              </p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">{item.title}</p>
          </>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{item.title}</p>
            {item.subtitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {item.subtitle}
              </p>
            ) : null}
          </>
        )}
        {isPaymentPipeline ? (
          <p className="mt-1 text-[11px] font-medium text-sky-800">
            Zahlung geplant — noch in der Pipeline
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.amount != null ? (
          <span className="text-sm font-semibold tabular-nums">
            {formatCHF(item.amount, item.currency || "CHF")}
          </span>
        ) : null}
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            isPaymentPipeline && "bg-sky-100 text-sky-900",
            isHockey && "bg-rose-50 text-rose-800"
          )}
        >
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

function NextHockeyCard({ game }: { game: HockeyGameCard }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-rose-700" />
          Nächstes Spiel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <TeamLogo
              label={game.homeTeam.label}
              src={game.homeTeam.logoUrl}
              size="lg"
            />
            <p className="line-clamp-2 text-xs font-medium leading-snug">
              {game.homeTeam.label}
            </p>
          </div>
          <div className="shrink-0 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {game.isHome ? "Heim" : "Auswärts"}
            </p>
            {game.score ? (
              <p className="text-lg font-bold tabular-nums tracking-tight">
                {game.score}
              </p>
            ) : (
              <p className="text-sm font-bold tabular-nums">
                {game.time || "—"}
              </p>
            )}
            {game.score && game.time ? (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {game.time}
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <TeamLogo
              label={game.awayTeam.label}
              src={game.awayTeam.logoUrl}
              size="lg"
            />
            <p className="line-clamp-2 text-xs font-medium leading-snug">
              {game.awayTeam.label}
            </p>
          </div>
        </div>
        {game.scorers.length > 0 ? (
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            {game.scorers.slice(0, 6).join(" · ")}
          </p>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">
          {weekdayLabel(game.date)}
          {game.location ? ` · ${game.location}` : ""}
        </p>
      </CardContent>
    </Card>
  );
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

  const upcomingGrouped = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of data?.upcoming14 || []) {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data?.upcoming14]);

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

            {data.hockey.nextGame ? (
              <NextHockeyCard game={data.hockey.nextGame} />
            ) : null}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Kommende 14 Tage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingGrouped.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine anstehenden Fristen.
                  </p>
                ) : (
                  upcomingGrouped.map(([date, items]) => (
                    <div key={date} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {weekdayLabel(date)}
                      </p>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <AgendaRow
                            key={item.id}
                            item={item}
                            variant="upcoming"
                          />
                        ))}
                      </div>
                    </div>
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
