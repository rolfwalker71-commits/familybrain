"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Video,
  MapPin,
  AlertTriangle,
  Car,
  CheckSquare,
  StickyNote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupStatusPanel } from "@/components/settings/backup-status-panel";
import { KpiCorrectSheet } from "@/components/dashboard/kpi-correct-sheet";
import { TeamLogo, weekdayLabel, AgendaTypeRail } from "@/components/calendar/agenda-row";
import { AgendaEventDialog } from "@/components/calendar/agenda-event-dialog";
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

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function eventWindowMinutes(item: AgendaItem): { start: number; end: number } | null {
  if (!item.time) return null;
  const start = hmToMinutes(item.time);
  if (start == null) return null;
  const end = item.endTime ? hmToMinutes(item.endTime) : null;
  return { start, end: end != null && end > start ? end : start + 60 };
}

function minutesUntilStart(item: AgendaItem, today: string, nowHm: string): number | null {
  if (!item.time || item.date !== today) return null;
  const start = hmToMinutes(item.time);
  const now = hmToMinutes(nowHm);
  if (start == null || now == null) return null;
  return start - now;
}

function formatCountdown(mins: number | null, ongoing: boolean): string | null {
  if (ongoing) return "Jetzt";
  if (mins == null) return null;
  if (mins <= 0) return "Jetzt";
  if (mins < 60) return `In ${mins} Min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `In ${h} Std` : `In ${h} Std ${m} Min`;
}

function shortPlace(item: AgendaItem): string | null {
  if (item.coords?.label) return item.coords.label;
  if (item.weather?.placeLabel) return item.weather.placeLabel;
  const loc = item.location?.trim();
  if (!loc) return null;
  const first = loc.split(",")[0]?.trim() || loc;
  return first.length > 28 ? `${first.slice(0, 26)}…` : first;
}

function buildNextStepLine(
  items: AgendaItem[],
  today: string,
  nowHm: string
): string | null {
  const focus = pickFocusAgendaItem(items, today, nowHm);
  if (!focus) return null;

  const now = hmToMinutes(nowHm) ?? 0;
  const w = eventWindowMinutes(focus);
  const ongoing = Boolean(w && now >= w.start && now < w.end);
  const countdown = formatCountdown(
    minutesUntilStart(focus, today, nowHm),
    ongoing
  );
  const place = shortPlace(focus);
  const drive = focus.driveLabel || null;
  const parts = [countdown, place, drive].filter(Boolean);
  if (parts.length === 0) {
    return [focus.time, focus.title].filter(Boolean).join(" · ") || null;
  }
  return parts.join(" · ");
}

/** Next upcoming today, else currently ongoing, else first later day — never a finished past slot. */
function isPlanningRelevant(item: AgendaItem): boolean {
  return item.planningRelevant !== false;
}

function pickFocusAgendaItem(
  items: AgendaItem[],
  today: string,
  nowHm: string
): AgendaItem | null {
  const pool = items.filter(isPlanningRelevant);
  if (!pool.length) return null;
  const todayTimed = pool.filter((i) => i.date === today && i.time);
  const now = hmToMinutes(nowHm) ?? 0;

  const ongoing =
    todayTimed.find((i) => {
      const w = eventWindowMinutes(i);
      return w && now >= w.start && now < w.end;
    }) || null;
  if (ongoing) return ongoing;

  const upcoming =
    todayTimed.find((i) => {
      const w = eventWindowMinutes(i);
      return w && w.start > now;
    }) || null;
  if (upcoming) return upcoming;

  const later = pool.find((i) => i.date > today);
  if (later) return later;

  return todayTimed[todayTimed.length - 1] || pool[0] || null;
}

function findConflicts(
  items: AgendaItem[],
  today: string
): Array<{ id: string; label: string }> {
  const timed = items.filter(
    (i) => i.date === today && i.time && isPlanningRelevant(i)
  );
  const out: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < timed.length; i += 1) {
    const a = timed[i]!;
    const wa = eventWindowMinutes(a);
    if (!wa) continue;
    for (let j = i + 1; j < timed.length; j += 1) {
      const b = timed[j]!;
      const wb = eventWindowMinutes(b);
      if (!wb) continue;
      if (wa.start < wb.end && wb.start < wa.end) {
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: key,
          label: `${a.time} ${a.title} ↔ ${b.time} ${b.title}`,
        });
      }
    }
  }
  return out;
}

function placeMapSrc(coords: { lat: number; lon: number }): string {
  return `/api/dashboard/place-map?lat=${coords.lat}&lon=${coords.lon}&z=14`;
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
  onSelect,
}: {
  items: AgendaItem[];
  activeId: string | null;
  today: string;
  onSelect: (item: AgendaItem) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        Keine Termine für heute — der Tag ist frei.
      </p>
    );
  }

  return (
    <ol className="relative grid grid-cols-[2.6rem_0.75rem_minmax(0,1fr)] gap-x-1.5 sm:grid-cols-[3.25rem_1.25rem_minmax(0,1fr)] sm:gap-x-3">
      {items.map((item, index) => {
        const active = item.id === activeId;
        const isTomorrow = item.date > today;
        const hm = item.time || "—";
        const isLast = index === items.length - 1;
        const showMap = active && item.coords;

        return (
          <li key={item.id} className="contents">
            <div className="flex flex-col items-end justify-start pt-2 text-right">
              {isTomorrow ? (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">
                  Morgen
                </span>
              ) : null}
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums leading-tight sm:text-xs",
                  active ? "text-emerald-800" : "text-muted-foreground"
                )}
              >
                {hm}
              </span>
              {item.endTime && item.time ? (
                <span className="text-[9px] tabular-nums text-muted-foreground/80 sm:text-[10px]">
                  –{item.endTime}
                </span>
              ) : null}
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
            <div
              className={cn(
                "mb-5 min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card last:mb-1",
                active && "border-emerald-200/90"
              )}
            >
              <div className="flex items-stretch">
                <AgendaTypeRail item={item} className="w-9 sm:w-[3.25rem]" />
                <div
                  className={cn(
                    "min-w-0 flex-1 px-3 py-2.5 transition-colors",
                    active && "bg-emerald-50/60"
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left hover:opacity-90"
                    onClick={() => onSelect(item)}
                  >
                    <div className="min-w-0 flex-1">
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
                          {item.weather.icon} {item.weather.temperatureC}°
                          {item.weather.labelDe
                            ? ` · ${item.weather.labelDe}`
                            : ""}
                        </p>
                      ) : null}
                      {active && item.driveLabel ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Car className="size-3 shrink-0" aria-hidden />
                          {item.driveLabel}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                      aria-hidden
                    />
                  </button>

                  {active && (item.meetUrl || item.mapsUrl || showMap) ? (
                    <div className="mt-2.5 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {item.meetUrl ? (
                          <a
                            href={item.meetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted/50"
                          >
                            <Video className="size-3.5" aria-hidden />
                            Meet
                          </a>
                        ) : null}
                        {item.mapsUrl ? (
                          <a
                            href={item.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted/50"
                          >
                            <MapPin className="size-3.5" aria-hidden />
                            Route
                          </a>
                        ) : null}
                      </div>
                      {showMap && item.coords ? (
                        <a
                          href={item.mapsUrl || placeMapSrc(item.coords)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border border-border/60"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={placeMapSrc(item.coords)}
                            alt={`Karte: ${item.coords.label}`}
                            className="h-28 w-full object-cover"
                            loading="lazy"
                          />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
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

const OVERVIEW_LS_KEY = "buddy-overview-cache-v1";
const OVERVIEW_LS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readStaleOverview(period: OverviewPeriod): OverviewPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OVERVIEW_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      period: OverviewPeriod;
      payload: OverviewPayload;
      at: number;
    };
    if (parsed.period !== period) return null;
    if (Date.now() - parsed.at > OVERVIEW_LS_MAX_AGE_MS) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeStaleOverview(period: OverviewPeriod, payload: OverviewPayload) {
  try {
    localStorage.setItem(
      OVERVIEW_LS_KEY,
      JSON.stringify({ period, payload, at: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Lade Übersicht">
      <section className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[4.5rem] animate-pulse rounded-xl bg-muted/80"
            />
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/80" />
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className="h-36 animate-pulse rounded-xl bg-muted/80" />
        <div className="h-36 animate-pulse rounded-xl bg-muted/80" />
      </section>
    </div>
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [eventDetail, setEventDetail] = useState<AgendaItem | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const dataRef = useRef<OverviewPayload | null>(null);
  dataRef.current = data;

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const stale = readStaleOverview(period);
    if (stale) {
      setData(stale);
      setFromCache(true);
      setLoading(false);
    } else {
      setData(null);
      setFromCache(false);
      setLoading(true);
    }
  }, [period]);

  const load = useCallback(async () => {
    const hasShell = Boolean(dataRef.current);
    if (hasShell) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ period, fresh: "1" });
      const res = await fetch(`/api/dashboard/overview?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      const payload = json as OverviewPayload;
      setData(payload);
      setFromCache(false);
      writeStaleOverview(period, payload);
    } catch (err) {
      if (!dataRef.current) setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  const removeReferenceNote = useCallback(
    async (id: number) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              referenceNotes: (prev.referenceNotes || []).filter(
                (n) => n.id !== id
              ),
            }
          : prev
      );
      try {
        const res = await fetch(`/api/reference-notes/${id}`, {
          method: "DELETE",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Löschen fehlgeschlagen");
        }
        void load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        void load();
      }
    },
    [load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // After first paint: mail AI may finish in background — pull chips again
  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 4500);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 90_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, [load]);

  const today = zurichTodayIso();
  // nowTick forces recompute when the clock advances
  const nowHm = useMemo(() => {
    void nowTick;
    return zurichNowHm();
  }, [nowTick]);

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

  const nextFocusEvent = useMemo(
    () => pickFocusAgendaItem(timelineItems, today, nowHm),
    [timelineItems, today, nowHm]
  );

  const activeId = nextFocusEvent?.id ?? null;

  const nextStepLine = useMemo(
    () => buildNextStepLine(timelineItems, today, nowHm),
    [timelineItems, today, nowHm]
  );

  const conflicts = useMemo(
    () => findConflicts(timelineItems, today),
    [timelineItems, today]
  );

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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {greeting}
            {greetingName ? `, ${greetingName}` : ""}
          </h1>
          {refreshing || fromCache ? (
            <p className="text-[11px] text-muted-foreground">
              {refreshing ? "Aktualisiere…" : "Zwischengespeicherte Ansicht"}
            </p>
          ) : null}
        </div>
        <p className="text-sm capitalize text-muted-foreground">
          {formatLongDeDate()}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      {loading && !data ? <OverviewSkeleton /> : null}

      {data ? (
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
                  nextFocusEvent
                    ? [
                        shortPlace(nextFocusEvent),
                        nextFocusEvent.driveLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ") ||
                      nextFocusEvent.subtitle ||
                      "Kalender öffnen"
                    : "Kalender öffnen"
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
                  data.chips.mailSuggestionsPending > 0
                    ? "/mail?tab=triage"
                    : mailSample
                      ? `/mail?open=${encodeURIComponent(mailSample.id)}`
                      : "/mail"
                }
                tone="amber"
                icon={Mail}
                eyebrow="Heute · Mail"
                title={
                  data.chips.mailSuggestionsPending > 0
                    ? `${data.chips.mailSuggestionsPending} Vorschlag${data.chips.mailSuggestionsPending === 1 ? "" : "e"}`
                    : mailSample
                      ? `${unreadMail.length || mailFocus.length} ${unreadMail.length ? "neu" : "heute"}`
                      : "Keine Mails"
                }
                detail={
                  data.chips.mailSuggestionsPending > 0
                    ? "Zur Triage"
                    : mailSample
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
              {nextStepLine ? (
                <p className="flex items-start gap-2 text-sm text-foreground/90">
                  <Clock3
                    className="mt-0.5 size-4 shrink-0 text-emerald-700"
                    strokeWidth={APP_ICON_STROKE}
                    absoluteStrokeWidth
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">Nächster Schritt · </span>
                    {nextStepLine}
                  </span>
                </p>
              ) : null}
              {conflicts.length > 0 ? (
                <div
                  className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-950"
                  role="status"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-700"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">Termin-Konflikt</p>
                    <ul className="mt-0.5 space-y-0.5 text-amber-900/90">
                      {conflicts.slice(0, 2).map((c) => (
                        <li key={c.id} className="truncate">
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
              <Card className="border-border/70">
                <CardContent className="px-3 py-3 sm:px-5 sm:py-4">
                  <DayTimeline
                    items={timelineItems}
                    activeId={activeId}
                    today={today}
                    onSelect={setEventDetail}
                  />
                </CardContent>
              </Card>
            </section>

            <aside className="min-w-0 space-y-4">
              {data.homeWeather ? (
                <HomeWeatherWidget weather={data.homeWeather} />
              ) : null}

              <Card className="border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckSquare
                      className="size-4 text-muted-foreground"
                      strokeWidth={APP_ICON_STROKE}
                      absoluteStrokeWidth
                      aria-hidden
                    />
                    Aufgaben · 7 Tage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!data.tasks?.hasScope ? (
                    <p className="text-xs text-muted-foreground">
                      Google Tasks noch nicht verbunden — unter{" "}
                      <Link
                        href="/account"
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        Konto
                      </Link>{" "}
                      neu verbinden (Tasks-API + Consent).
                    </p>
                  ) : data.tasks.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Keine offenen Aufgaben in den nächsten 7 Tagen.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {data.tasks.items.slice(0, 10).map((t) => (
                        <li key={t.id}>
                          <a
                            href={t.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 rounded-lg px-1 py-0.5 hover:bg-muted/40"
                          >
                            <span
                              className={cn(
                                "mt-1.5 size-1.5 shrink-0 rounded-full",
                                t.overdue
                                  ? "bg-rose-600"
                                  : t.dueDate === today
                                    ? "bg-emerald-600"
                                    : "bg-muted-foreground/40"
                              )}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium leading-snug">
                                {t.title}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t.overdue
                                  ? "Überfällig"
                                  : t.dueDate
                                    ? t.dueDate === today
                                      ? "Heute"
                                      : weekdayLabel(t.dueDate)
                                    : "Ohne Datum"}
                                {t.listTitle ? ` · ${t.listTitle}` : ""}
                              </p>
                            </div>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {data.referenceNotes && data.referenceNotes.length > 0 ? (
                <Card className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <StickyNote
                        className="size-4 text-muted-foreground"
                        strokeWidth={APP_ICON_STROKE}
                        absoluteStrokeWidth
                        aria-hidden
                      />
                      Referenzen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {data.referenceNotes.map((n) => (
                        <li
                          key={n.id}
                          className="flex min-w-0 items-start gap-2 px-1"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {n.title}
                            </p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {n.reference || "—"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`${n.title} entfernen`}
                            onClick={() => void removeReferenceNote(n.id)}
                          >
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
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
      <AgendaEventDialog
        item={eventDetail}
        open={Boolean(eventDetail)}
        onOpenChange={(open) => {
          if (!open) setEventDetail(null);
        }}
      />
    </div>
  );
}
