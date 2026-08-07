"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Mail,
  Clock3,
  Trophy,
  Wallet,
  ChevronRight,
  Plane,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupStatusPanel } from "@/components/settings/backup-status-panel";
import { KpiCorrectSheet } from "@/components/dashboard/kpi-correct-sheet";
import { TeamLogo, weekdayLabel } from "@/components/calendar/agenda-row";
import { formatCHF } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { windDirectionDe } from "@/lib/trips/weather";
import type {
  AgendaItem,
  HockeyGameCard,
  HomeWeatherCard,
  OverviewPayload,
  OverviewPeriod,
} from "@/lib/dashboard/overview";
import type { MailListItem } from "@/lib/mail/gmail";

const PERIODS: { id: OverviewPeriod; label: string }[] = [
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "quarter", label: "Quartal" },
  { id: "half", label: "Halbjahr" },
  { id: "year", label: "Jahr" },
];

function zurichTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function zurichNowHm(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function formatLongDeDate(d = new Date()): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

function itemHref(item: AgendaItem): string {
  if (item.href) return item.href;
  if (item.documentId) return `/documents/${item.documentId}`;
  if (item.kind === "deadline") return "/deadlines";
  if (item.kind === "travel") return "/travel";
  return "/calendar";
}

function HomeWeatherWidget({ weather }: { weather: HomeWeatherCard }) {
  const windDir =
    weather.windDirectionDeg != null &&
    Number.isFinite(weather.windDirectionDeg)
      ? windDirectionDe(weather.windDirectionDeg)
      : null;
  const precip =
    weather.precipitationMm != null && weather.precipitationMm > 0
      ? `${weather.precipitationMm.toFixed(1).replace(".", ",")} mm`
      : "0 mm";

  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0">
      <CardContent className="p-0">
        <div className="flex items-stretch gap-0">
          <div className="flex w-[5.5rem] shrink-0 flex-col items-center justify-center self-stretch bg-sky-50/90 px-2 py-4">
            <span className="text-5xl leading-none" aria-hidden>
              {weather.icon}
            </span>
            <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-sky-900/70">
              Jetzt
            </p>
          </div>
          <div className="min-w-0 flex-1 space-y-3 px-4 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight text-foreground">
                  {weather.placeLabel}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {weather.weatherLabelDe}
                </p>
              </div>
              <p className="shrink-0 text-3xl font-bold tabular-nums tracking-tight">
                {weather.temperatureC}°
              </p>
            </div>
            {(weather.temperatureMinC != null ||
              weather.temperatureMaxC != null) && (
              <p className="text-xs tabular-nums text-muted-foreground">
                Heute{" "}
                <span className="font-medium text-foreground">
                  {weather.temperatureMinC ?? "—"}°
                </span>
                {" – "}
                <span className="font-medium text-foreground">
                  {weather.temperatureMaxC ?? "—"}°
                </span>
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 border-t border-border/50 pt-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Wind
                </p>
                <p className="truncate text-sm font-semibold tabular-nums">
                  {weather.windSpeedKmh != null
                    ? `${weather.windSpeedKmh}`
                    : "—"}
                  <span className="ml-0.5 text-[11px] font-medium text-muted-foreground">
                    km/h
                  </span>
                </p>
                {windDir ? (
                  <p className="text-[10px] text-muted-foreground">{windDir}</p>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Feuchte
                </p>
                <p className="truncate text-sm font-semibold tabular-nums">
                  {weather.humidityPct != null ? weather.humidityPct : "—"}
                  <span className="ml-0.5 text-[11px] font-medium text-muted-foreground">
                    %
                  </span>
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Regen
                </p>
                <p className="truncate text-sm font-semibold tabular-nums">
                  {precip}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
              <p className="text-[11px] tabular-nums text-muted-foreground">
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
        <p className="text-center text-xs text-muted-foreground">
          {weekdayLabel(game.date)}
          {game.location ? ` · ${game.location}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function DayTimeline({
  items,
  activeId,
  today,
}: {
  items: AgendaItem[];
  activeId: string | null;
  today: string;
}) {
  if (items.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        Keine Termine für heute — der Tag ist frei.
      </p>
    );
  }

  return (
    <ol className="relative grid grid-cols-[3.5rem_1.25rem_minmax(0,1fr)] gap-x-3">
      {items.map((item, index) => {
        const active = item.id === activeId;
        const isTomorrow = item.date > today;
        const hm = item.time || "—";
        const isLast = index === items.length - 1;

        return (
          <li key={item.id} className="contents">
            <div className="flex flex-col items-end justify-start pt-2 text-right">
              {isTomorrow ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Morgen
                </span>
              ) : null}
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums leading-tight",
                  active ? "text-emerald-800" : "text-muted-foreground"
                )}
              >
                {hm}
              </span>
            </div>
            <div className="relative flex justify-center pt-2.5 pb-5">
              {!isLast ? (
                <span
                  className="absolute left-1/2 top-5 bottom-0 w-px -translate-x-1/2 bg-border/70"
                  aria-hidden
                />
              ) : null}
              {index > 0 ? (
                <span
                  className="absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-border/70"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-[1] size-3 shrink-0 rounded-full border-2",
                  active
                    ? "border-emerald-600 bg-emerald-600 shadow-[0_0_0_4px_rgba(5,150,105,0.2)]"
                    : "border-muted-foreground/35 bg-background"
                )}
                aria-current={active ? "true" : undefined}
                aria-hidden={!active}
              />
            </div>
            <Link
              href={itemHref(item)}
              className={cn(
                "mb-5 min-w-0 rounded-xl border border-border/60 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40 last:mb-1",
                active && "border-emerald-200/90 bg-emerald-50/50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    {item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </p>
                  ) : null}
                  {item.weather ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {item.weather.icon} {item.weather.temperatureC}° ·{" "}
                      {item.weather.placeLabel}
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function FocusTile({
  href,
  tone,
  icon: Icon,
  eyebrow,
  title,
  detail,
}: {
  href: string;
  tone: "teal" | "rose" | "amber";
  icon: typeof CalendarDays;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  const toneCls = {
    teal: "border-l-emerald-600 bg-emerald-50/40",
    rose: "border-l-rose-600 bg-rose-50/40",
    amber: "border-l-amber-500 bg-amber-50/40",
  }[tone];
  const iconCls = {
    teal: "text-emerald-800",
    rose: "text-rose-800",
    amber: "text-amber-800",
  }[tone];

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-2xl border border-border/60 border-l-4 bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-muted/30",
        toneCls
      )}
    >
      <Icon
        className={cn("mt-0.5 size-5 shrink-0", iconCls)}
        strokeWidth={APP_ICON_STROKE}
        absoluteStrokeWidth
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <p className="truncate text-base font-semibold tracking-tight">
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </Link>
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

  const today = zurichTodayIso();
  const nowHm = zurichNowHm();

  const timelineItems = useMemo(() => {
    if (!data) return [] as AgendaItem[];
    const byId = new Map<string, AgendaItem>();
    for (const item of data.todayCalendar || []) {
      byId.set(item.id, item);
    }
    for (const item of data.agenda || []) {
      if (item.date === today) byId.set(item.id, item);
    }
    return [...byId.values()].sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
  }, [data, today]);

  const activeId = useMemo(() => {
    const todayTimed = timelineItems.filter(
      (i) => i.date === today && i.time
    );
    if (todayTimed.length === 0) {
      return timelineItems[0]?.id ?? null;
    }
    let active: string | null = null;
    for (const it of todayTimed) {
      if ((it.time || "") <= nowHm) active = it.id;
    }
    return active || todayTimed[0]!.id;
  }, [timelineItems, today, nowHm]);

  const nextFocusEvent = useMemo(() => {
    if (!timelineItems.length) return null;
    const active =
      timelineItems.find((i) => i.id === activeId) || timelineItems[0];
    return active;
  }, [timelineItems, activeId]);

  const laterCounts = useMemo(() => {
    if (!data) {
      return { travel: 0, deadlines: 0, pipeline: 0, travelSample: "", deadlineSample: "", pipelineSample: "" };
    }
    const later = (data.agenda || []).filter((i) => i.date > today);
    const travel = later.filter((i) => i.kind === "travel");
    const deadlines = later.filter((i) => i.kind === "deadline");
    const pipeline = later.filter(
      (i) =>
        i.kind === "invoice" &&
        (i.subtitle || "").toLowerCase().includes("pipeline")
    );
    return {
      travel: travel.length,
      deadlines: deadlines.length,
      pipeline: pipeline.length,
      travelSample: travel[0]?.title || "",
      deadlineSample: deadlines
        .slice(0, 3)
        .map((d) => d.title)
        .join(" · "),
      pipelineSample: pipeline[0]?.title || "",
    };
  }, [data, today]);

  const hour = new Date().getHours();
  const greeting =
    hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

  const kpiMax = Math.max(
    ...(data?.kpi.byCategory.map((c) => c.total) || [1]),
    1
  );

  const mailFocus = (data?.todayMail || []) as MailListItem[];
  const unreadMail = mailFocus.filter((m) => m.unread);
  const mailSample = unreadMail[0] || mailFocus[0];

  return (
    <div className="min-w-0 space-y-6 pb-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting}
          {greetingName ? `, ${greetingName}` : ""}
        </h1>
        <p className="text-sm capitalize text-muted-foreground">
          {formatLongDeDate()}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading && !data ? (
        <p className="text-sm text-muted-foreground">Lade Übersicht…</p>
      ) : data ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Heute im Fokus
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <FocusTile
                href={nextFocusEvent ? itemHref(nextFocusEvent) : "/calendar"}
                tone="teal"
                icon={CalendarDays}
                eyebrow="Nächster Termin"
                title={
                  nextFocusEvent
                    ? [
                        nextFocusEvent.time,
                        nextFocusEvent.title,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Keine Termine"
                }
                detail={
                  nextFocusEvent?.subtitle ||
                  nextFocusEvent?.location ||
                  "Kalender öffnen"
                }
              />
              <FocusTile
                href="/finance"
                tone="rose"
                icon={Wallet}
                eyebrow="Offen"
                title={
                  data.chips.openDueCount > 0
                    ? formatCHF(data.chips.openDueAmount)
                    : "Nichts offen"
                }
                detail={
                  data.chips.openDueCount > 0
                    ? `${data.chips.openDueCount} Zahlung${data.chips.openDueCount === 1 ? "" : "en"}`
                    : "Finanzen im Blick"
                }
              />
              <FocusTile
                href={
                  mailSample
                    ? `/mail?open=${encodeURIComponent(mailSample.id)}`
                    : "/mail"
                }
                tone="amber"
                icon={Mail}
                eyebrow="Heute · Mail"
                title={
                  mailSample
                    ? `${unreadMail.length || mailFocus.length} ${unreadMail.length ? "neu" : "heute"}`
                    : "Keine Mails"
                }
                detail={
                  mailSample
                    ? `${mailSample.fromName} · ${mailSample.subject}`
                    : "Posteingang"
                }
              />
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.85fr)]">
            <section className="min-w-0 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-tight">
                  Heute · Ablauf
                </h2>
                <Link
                  href="/calendar"
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Alle Termine →
                </Link>
              </div>
              <Card className="border-border/70">
                <CardContent className="px-4 py-4 sm:px-5">
                  <DayTimeline
                    items={timelineItems}
                    activeId={activeId}
                    today={today}
                  />
                </CardContent>
              </Card>
            </section>

            <aside className="min-w-0 space-y-4">
              {data.homeWeather ? (
                <HomeWeatherWidget weather={data.homeWeather} />
              ) : null}

              {data.hockey.nextGame ? (
                <NextHockeyCard game={data.hockey.nextGame} />
              ) : null}

              <Card className="border-border/70">
                <CardHeader className="space-y-3 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Kennzahlen</CardTitle>
                    <div className="flex flex-wrap gap-1">
                      {PERIODS.map((p) => (
                        <Button
                          key={p.id}
                          type="button"
                          size="sm"
                          variant={period === p.id ? "default" : "ghost"}
                          className={cn(
                            "h-7 px-2 text-xs",
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
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCHF(data.kpi.total)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ausgaben · {PERIODS.find((p) => p.id === period)?.label}
                  </p>
                  <div className="space-y-2">
                    {data.kpi.byCategory.slice(0, 5).map((slice) => (
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
                      Korrigieren
                    </Button>
                    <Link
                      href="/finance"
                      className="inline-flex h-8 items-center text-xs font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                    >
                      Analyse →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Später im Monat
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <Link
                href="/travel"
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 hover:bg-muted/30"
              >
                <Plane className="mt-0.5 size-4 shrink-0 text-sky-700" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Reisen · {laterCounts.travel}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {laterCounts.travelSample || "Keine Reisen geplant"}
                  </p>
                </div>
              </Link>
              <Link
                href="/deadlines"
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 hover:bg-muted/30"
              >
                <Clock3 className="mt-0.5 size-4 shrink-0 text-teal-700" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Fristen · {laterCounts.deadlines || data.chips.urgentDeadlines}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {laterCounts.deadlineSample || "Keine offenen Fristen"}
                  </p>
                </div>
              </Link>
              <Link
                href="/finance"
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 hover:bg-muted/30"
              >
                <ListChecks className="mt-0.5 size-4 shrink-0 text-[var(--brand-finance)]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Pipeline · {laterCounts.pipeline}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {laterCounts.pipelineSample || "Keine geplanten Zahlungen"}
                  </p>
                </div>
              </Link>
            </div>
            {data.chips.triagePending > 0 ? (
              <Link
                href="/inbox"
                className="inline-flex items-center gap-2 text-xs font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
              >
                <Mail className="size-3.5" />
                {data.chips.triagePending} Triage in der Inbox →
              </Link>
            ) : null}
          </section>

          <div className="pt-2">
            <BackupStatusPanel />
          </div>
        </>
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
