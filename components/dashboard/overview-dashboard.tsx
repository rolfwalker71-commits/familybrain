"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Mail,
  ChartColumnIncreasing,
  Clock3,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupStatusPanel } from "@/components/settings/backup-status-panel";
import { KpiCorrectSheet } from "@/components/dashboard/kpi-correct-sheet";
import {
  AgendaRow,
  TeamLogo,
  weekdayLabel,
} from "@/components/calendar/agenda-row";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";
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

const PERIODS: { id: OverviewPeriod; label: string }[] = [
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "quarter", label: "Quartal" },
  { id: "half", label: "Halbjahr" },
  { id: "year", label: "Jahr" },
];

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

  const todayGrouped = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of data?.todayCalendar || []) {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data?.todayCalendar]);

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
            href="/calendar"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-muted/40"
          >
            <CalendarDays className="size-3.5 text-muted-foreground" strokeWidth={APP_ICON_STROKE} absoluteStrokeWidth aria-hidden />
            Termine
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
            {data.homeWeather ? (
              <HomeWeatherWidget weather={data.homeWeather} />
            ) : null}
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
                <CardTitle className="text-base">Heute · Termine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {todayGrouped.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Termine für heute.
                  </p>
                ) : (
                  todayGrouped.map(([date, items]) => (
                    <div key={date} className="space-y-2">
                      {todayGrouped.length > 1 ? (
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {weekdayLabel(date)}
                        </p>
                      ) : null}
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
                  href="/calendar"
                  className="inline-flex text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Alle Termine →
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Heute · Mail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data.todayMail || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Mails für heute (oder Google nicht verbunden).
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(data.todayMail || []).map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/mail?open=${encodeURIComponent(m.id)}`}
                          className="flex items-start gap-2 rounded-lg border border-border/50 px-2.5 py-2 hover:bg-muted/40"
                        >
                          {m.unread ? (
                            <span
                              className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--brand-docs)]"
                              aria-hidden
                            />
                          ) : (
                            <span className="mt-1.5 size-2 shrink-0" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {m.fromName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {m.subject}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/mail"
                  className="inline-flex text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Posteingang →
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
