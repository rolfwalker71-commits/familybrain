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
  StickyNote,
  X,
  Sparkles,
  HardDrive,
  Cake,
  Video,
  MapPin,
  AlertTriangle,
  Car,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupStatusPanel } from "@/components/settings/backup-status-panel";
import { KpiCorrectSheet } from "@/components/dashboard/kpi-correct-sheet";
import { HomeTasksSection } from "@/components/dashboard/home-tasks-section";
import { TeamLogo, weekdayLabel, AgendaTypeRail } from "@/components/calendar/agenda-row";
import { AgendaAiIconThumb } from "@/components/calendar/agenda-ai-icon-thumb";
import { AgendaEventDialog } from "@/components/calendar/agenda-event-dialog";
import { formatCHF } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { windDirectionDe } from "@/lib/trips/weather";
import { filterAblaufTimelineItems } from "@/lib/dashboard/ablauf-timeline";
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

function shortPlace(item: AgendaItem): string | null {
  if (item.coords?.label) return item.coords.label;
  if (item.weather?.placeLabel) return item.weather.placeLabel;
  const loc = item.location?.trim();
  if (!loc) return null;
  const first = loc.split(",")[0]?.trim() || loc;
  return first.length > 28 ? `${first.slice(0, 26)}…` : first;
}

function isBirthdayItem(item: AgendaItem): boolean {
  return (
    item.badge === "Geburtstag" ||
    item.calendarType === "birthday" ||
    /^Geburtstag\b/i.test(item.title) ||
    /\bhat\s+Geburtstag\b/i.test(item.title)
  );
}

function isPlanningRelevant(item: AgendaItem): boolean {
  return item.planningRelevant !== false;
}

function isBuddyRitualItem(item: AgendaItem): boolean {
  return (item.id || "").startsWith("buddy-day-close");
}

/**
 * KPI «Nächster Termin»: heutige Termine, die noch nicht begonnen haben
 * (optional ergänzt um morgige), max. `limit`.
 */
function pickNextUpcomingAgendaItems(
  items: AgendaItem[],
  today: string,
  nowHm: string,
  limit = 2
): AgendaItem[] {
  const pool = items
    .filter((i) => isPlanningRelevant(i) && !isBirthdayItem(i))
    .sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
  if (!pool.length) return [];
  const now = hmToMinutes(nowHm) ?? 0;
  const out: AgendaItem[] = [];
  for (const i of pool) {
    if (out.length >= limit) break;
    if (i.date === today && i.time) {
      const w = eventWindowMinutes(i);
      if (w != null && w.start > now) out.push(i);
      continue;
    }
    if (i.date > today) out.push(i);
  }
  return out;
}

function pickNextUpcomingAgendaItem(
  items: AgendaItem[],
  today: string,
  nowHm: string
): AgendaItem | null {
  return pickNextUpcomingAgendaItems(items, today, nowHm, 1)[0] ?? null;
}

/** Timeline-Highlight: laufender Termin, sonst nächster heute, sonst morgen. */
function pickActiveTimelineItem(
  items: AgendaItem[],
  today: string,
  nowHm: string
): AgendaItem | null {
  const pool = items.filter(
    (i) => isPlanningRelevant(i) && !isBirthdayItem(i)
  );
  if (!pool.length) return null;
  const todayTimed = pool.filter((i) => i.date === today && i.time);
  const now = hmToMinutes(nowHm) ?? 0;

  const ongoing =
    todayTimed.find((i) => {
      const w = eventWindowMinutes(i);
      return w && now >= w.start && now < w.end;
    }) || null;
  if (ongoing) return ongoing;

  const upcomingToday = pickNextUpcomingAgendaItem(items, today, nowHm);
  if (upcomingToday) return upcomingToday;

  return pool.find((i) => i.date > today) || null;
}

function collectUpcomingBirthdays(
  data: OverviewPayload,
  today: string
): AgendaItem[] {
  if (data.upcomingBirthdays?.length) {
    return data.upcomingBirthdays.filter((i) => i.date >= today);
  }
  // Fallback if ältere Cache-Payload ohne Feld
  const end = (() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const byId = new Map<string, AgendaItem>();
  for (const item of [...(data.todayCalendar || []), ...(data.agenda || [])]) {
    if (!isBirthdayItem(item)) continue;
    if (item.date < today || item.date > end) continue;
    byId.set(item.id, item);
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "de")
  );
}

function birthdayDayLabel(date: string, today: string): string {
  if (date === today) return "Heute";
  const t = new Date(`${today}T12:00:00`);
  const d = new Date(`${date}T12:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return "Morgen";
  return weekdayLabel(date);
}

function findConflicts(
  items: AgendaItem[],
  today: string,
  nowHm: string
): Array<{ id: string; label: string }> {
  const timed = items.filter(
    (i) =>
      i.date === today &&
      i.time &&
      isPlanningRelevant(i) &&
      !isBirthdayItem(i) &&
      !isBuddyRitualItem(i)
  );
  const now = hmToMinutes(nowHm) ?? 0;
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
      if (!(wa.start < wb.end && wb.start < wa.end)) continue;
      // Konflikt-Hinweis nur bis Ende der Überschneidung
      const overlapEnd = Math.min(wa.end, wb.end);
      if (now >= overlapEnd) continue;
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: key,
        label: `${a.time} ${a.title} ↔ ${b.time} ${b.title}`,
      });
    }
  }
  return out;
}

import { TripMap } from "@/components/trips/trip-map";

function weekdayShortDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "short",
    timeZone: "Europe/Zurich",
  }).format(new Date(y, m - 1, d));
}

/** Kompakte Header-Wetterkarte mit 7-Tage-Zeile. */
function HomeWeatherWidget({ weather }: { weather: HomeWeatherCard }) {
  const windDir =
    weather.windDirectionDeg != null &&
    Number.isFinite(weather.windDirectionDeg)
      ? windDirectionDe(weather.windDirectionDeg)
      : null;
  const meta = [
    windDir && weather.windSpeedKmh != null
      ? `${weather.windSpeedKmh} km/h ${windDir}`
      : weather.windSpeedKmh != null
        ? `${weather.windSpeedKmh} km/h`
        : null,
    weather.humidityPct != null ? `${weather.humidityPct} %` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const week = weather.week ?? [];

  return (
    <div className="w-full min-w-0 rounded-xl border border-border/70 bg-sky-50/50 px-3 py-2.5 sm:max-w-md sm:px-3.5 sm:py-3">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <span className="text-[2.25rem] leading-none" aria-hidden>
            {weather.icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold tracking-tight">
                {weather.placeLabel}
              </p>
              <p className="truncate text-[12px] capitalize text-muted-foreground">
                {weather.weatherLabelDe}
              </p>
            </div>
            <p className="shrink-0 text-[28px] font-bold tabular-nums leading-none tracking-tight">
              {weather.temperatureC}°
            </p>
          </div>
          {(weather.temperatureMinC != null ||
            weather.temperatureMaxC != null) && (
            <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
              Heute{" "}
              <span className="font-medium text-foreground">
                {weather.temperatureMinC ?? "—"}°
              </span>
              {" – "}
              <span className="font-medium text-foreground">
                {weather.temperatureMaxC ?? "—"}°
              </span>
              {meta ? (
                <span className="text-muted-foreground/80"> · {meta}</span>
              ) : null}
            </p>
          )}
        </div>
      </div>

      {week.length > 0 ? (
        <ul
          className="mt-2.5 grid gap-0.5 border-t border-sky-200/60 pt-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(7, Math.max(1, week.length))}, minmax(0, 1fr))`,
          }}
          aria-label="Wetter Woche"
        >
          {week.map((day, i) => (
            <li
              key={day.date}
              className={cn(
                "flex min-w-0 flex-col items-center rounded-md px-0.5 py-1 text-center",
                i === 0 && "bg-white/70"
              )}
              title={`${weekdayShortDe(day.date)}: ${day.weatherLabelDe}, ${day.temperatureMinC}–${day.temperatureMaxC}°`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {i === 0 ? "Heute" : weekdayShortDe(day.date)}
              </span>
              <span className="mt-0.5 text-[1.05rem] leading-none" aria-hidden>
                {day.icon}
              </span>
              <span className="mt-1 text-[10px] font-semibold tabular-nums leading-tight text-foreground">
                {day.temperatureMaxC}°
              </span>
              <span className="text-[10px] tabular-nums leading-tight text-muted-foreground">
                {day.temperatureMinC}°
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Zustand: Drive-Spiegel und kurze System-Hinweise (keine doppelten Listen). */
function SystemStatusCard({
  data,
}: {
  data: OverviewPayload;
}) {
  const drive = data.driveMirror;
  const mailPending = data.chips.mailSuggestionsPending;
  const docTriage = data.chips.triagePending;

  let driveLine = "Drive-Spiegel: Status unbekannt";
  let driveTone: "ok" | "warn" | "muted" = "muted";
  if (drive) {
    if (!drive.connected) {
      driveLine = "Google nicht verbunden";
      driveTone = "warn";
    } else if (!drive.hasDriveScope) {
      driveLine = "Drive-Recht fehlt — unter Konto neu verbinden";
      driveTone = "warn";
    } else if (!drive.enabled) {
      driveLine = "Drive-Spiegel aus";
      driveTone = "muted";
    } else if (drive.complete) {
      driveLine = `Drive synchron · ${drive.mirrored}/${drive.totalDocuments}`;
      driveTone = "ok";
    } else {
      driveLine = `Drive ${drive.percent}% · ${drive.pending} ausstehend`;
      driveTone = "warn";
    }
  }

  const extras: string[] = [];
  if (mailPending > 0) extras.push(`${mailPending} Mail zur Triage`);
  if (docTriage > 0) extras.push(`${docTriage} Belege offen`);
  if (drive?.lastError) extras.push(`Drive-Fehler: ${drive.lastError}`);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[16px] font-black">
          <HardDrive
            className="size-4 text-muted-foreground"
            strokeWidth={APP_ICON_STROKE}
            absoluteStrokeWidth
            aria-hidden
          />
          Zustand
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {drive ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={cn(
                  "text-[13px] font-semibold",
                  driveTone === "warn" && "text-amber-900",
                  driveTone === "ok" && "text-emerald-900",
                  driveTone === "muted" && "text-muted-foreground"
                )}
              >
                {driveLine}
              </p>
              <span className="tabular-nums text-[12px] text-muted-foreground">
                {drive.percent}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={drive.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Drive-Spiegel Fortschritt"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  drive.complete
                    ? "bg-emerald-600/80"
                    : "bg-[var(--brand-docs)]"
                )}
                style={{ width: `${drive.percent}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {drive.mirrored}/{drive.totalDocuments} Dokumente
              {drive.lastRunAt
                ? ` · zuletzt ${new Date(drive.lastRunAt).toLocaleString("de-CH", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : " · noch kein Lauf"}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">{driveLine}</p>
        )}

        {extras.length > 0 ? (
          <ul className="space-y-1 border-t border-border/50 pt-2 text-[12px] text-muted-foreground">
            {extras.map((line) => (
              <li key={line} className="truncate">
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        {(() => {
          const sched = data.scheduler;
          const tickLabel = !sched
            ? null
            : !sched.enabled
              ? "Scheduler aus"
              : sched.nextTickAt
                ? `Nächster Tick · ${new Date(sched.nextTickAt).toLocaleString(
                    "de-CH",
                    {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}`
                : "Scheduler · wartet";
          return tickLabel ? (
            <p className="border-t border-border/50 pt-2 text-[12px] text-muted-foreground">
              <Clock3
                className="mr-1 inline size-3.5 align-[-2px]"
                strokeWidth={APP_ICON_STROKE}
                absoluteStrokeWidth
                aria-hidden
              />
              {tickLabel}
            </p>
          ) : null;
        })()}

        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-[12px]">
          <Link
            href="/sync?tab=automation"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Interne Jobs
          </Link>
          <Link
            href="/account"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Konto · Drive
          </Link>
          {mailPending > 0 ? (
            <Link
              href="/google?tab=triage"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Mail-Triage
            </Link>
          ) : null}
          {docTriage > 0 ? (
            <Link
              href="/inbox"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Inbox
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function NextHockeyCard({ game }: { game: HockeyGameCard }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[16px] font-black">
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
            <p className="line-clamp-2 text-[13px] font-medium leading-snug">
              {game.homeTeam.label}
            </p>
          </div>
          <div className="shrink-0 text-center">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              {game.isHome ? "Heim" : "Auswärts"}
            </p>
            {game.score ? (
              <p className="text-[19px] font-bold tabular-nums tracking-tight">
                {game.score}
              </p>
            ) : (
              <p className="text-[15px] font-bold tabular-nums">
                {game.time || "—"}
              </p>
            )}
            {game.score && game.time ? (
              <p className="text-[12px] tabular-nums text-muted-foreground">
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
            <p className="line-clamp-2 text-[13px] font-medium leading-snug">
              {game.awayTeam.label}
            </p>
          </div>
        </div>
        <p className="text-center text-[13px] text-muted-foreground">
          {weekdayLabel(game.date)}
          {game.location ? ` · ${game.location}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function BirthdaysAsideCard({
  items,
  today,
}: {
  items: AgendaItem[];
  today: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[16px] font-black">
          <Cake
            className="size-4 text-pink-700"
            strokeWidth={APP_ICON_STROKE}
            absoluteStrokeWidth
            aria-hidden
          />
          Geburtstage
        </CardTitle>
        <p className="text-[12px] text-muted-foreground">
          Heute bis in 7 Tagen
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <span className="w-14 shrink-0 text-[12px] font-medium text-muted-foreground">
                {birthdayDayLabel(item.date, today)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">
                  {item.title.replace(/^Geburtstag\s+/i, "")}
                </span>
                {item.subtitle ? (
                  <span className="text-[11px] text-muted-foreground">
                    {item.subtitle}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/calendar"
          className="mt-3 inline-block text-[12px] font-medium text-muted-foreground underline-offset-2 hover:underline"
        >
          Kalender →
        </Link>
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
      <p className="px-1 py-6 text-[15px] text-muted-foreground">
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
        // Karte wenn geocodiert (virtuelle Orte werden serverseitig nicht angereichert)
        const showMap = Boolean(item.coords);

        return (
          <li key={item.id} className="contents">
            <div className="flex flex-col items-end justify-start pt-2 text-right">
              {isTomorrow ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                  Morgen
                </span>
              ) : null}
              <span
                className={cn(
                  "text-[12px] font-semibold tabular-nums leading-tight sm:text-[13px]",
                  active ? "text-emerald-800" : "text-muted-foreground"
                )}
              >
                {hm}
              </span>
              {item.endTime && item.time ? (
                <span className="text-[10px] tabular-nums text-muted-foreground/80 sm:text-[11px]">
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
                      <p className="truncate text-[14px] font-black tracking-tight">
                        {item.title}
                      </p>
                      {item.subtitle ? (
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                          {item.subtitle}
                        </p>
                      ) : null}
                      {item.weather ? (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {item.weather.icon} {item.weather.temperatureC}°
                          {item.weather.labelDe
                            ? ` · ${item.weather.labelDe}`
                            : ""}
                        </p>
                      ) : null}
                      {item.driveLabel ? (
                        <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                          <Car className="size-3 shrink-0" aria-hidden />
                          {item.driveLabel}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-start gap-1.5">
                      <AgendaAiIconThumb
                        itemId={item.id}
                        title={item.title}
                        location={item.location}
                        description={item.description}
                        calendarType={item.calendarType}
                        calendarName={item.calendarName}
                        kind={item.kind}
                        meetUrl={item.meetUrl}
                        time={item.time}
                        endTime={item.endTime}
                        driveMinutes={item.driveMinutes}
                        distanceKm={item.distanceKm}
                        coords={
                          item.coords
                            ? { lat: item.coords.lat, lon: item.coords.lon }
                            : null
                        }
                        aiIconKey={item.aiIconKey}
                        aiIconUrl={item.aiIconUrl}
                      />
                      <ChevronRight
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                        aria-hidden
                      />
                    </div>
                  </button>

                  {item.meetUrl || item.mapsUrl || showMap ? (
                    <div className="mt-2.5 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {item.meetUrl ? (
                          <a
                            href={item.meetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-[12px] font-medium text-foreground hover:bg-muted/50"
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
                            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-[12px] font-medium text-foreground hover:bg-muted/50"
                          >
                            <MapPin className="size-3.5" aria-hidden />
                            Route
                          </a>
                        ) : null}
                      </div>
                      {showMap && item.coords ? (
                        <TripMap
                          points={[
                            {
                              lat: item.coords.lat,
                              lon: item.coords.lon,
                              label: item.coords.label,
                            },
                          ]}
                          heightClassName="h-28"
                          className="rounded-lg"
                          compact
                        />
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
  tone: "teal" | "rose" | "amber" | "sky";
  icon: typeof CalendarDays;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  const toneCls = {
    teal: "border-l-emerald-600 bg-emerald-50/40",
    rose: "border-l-rose-600 bg-rose-50/40",
    amber: "border-l-amber-500 bg-amber-50/40",
    sky: "border-l-sky-600 bg-sky-50/40",
  }[tone];
  const iconCls = {
    teal: "text-emerald-800",
    rose: "text-rose-800",
    amber: "text-amber-800",
    sky: "text-sky-800",
  }[tone];

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-2xl border border-border/60 border-l-4 bg-card px-3.5 py-2.5 shadow-sm transition-colors hover:bg-muted/30",
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
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <p className="truncate text-[15px] font-black tracking-tight">
          {title}
        </p>
        <p className="truncate text-[13px] text-muted-foreground">{detail}</p>
      </div>
    </Link>
  );
}

function formatMailAnalyseTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    return new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return null;
  }
}

function mailAnalyseLine(stats: {
  analyzedToday: number;
  pendingTriage: number;
}): string {
  if (stats.pendingTriage > 0) {
    return `${stats.pendingTriage} zur Triage`;
  }
  if (stats.analyzedToday > 0) {
    return `${stats.analyzedToday} analysiert`;
  }
  return "Noch keine Analyse";
}

function MailAnalyseFocusTile({
  google,
  microsoft,
}: {
  google: {
    analyzedToday: number;
    pendingTriage: number;
    lastAnalyzedAt?: string | null;
  };
  microsoft: {
    analyzedToday: number;
    pendingTriage: number;
    lastAnalyzedAt?: string | null;
  };
}) {
  const msTime = formatMailAnalyseTime(microsoft.lastAnalyzedAt);
  const gTime = formatMailAnalyseTime(google.lastAnalyzedAt);

  return (
    <div
      className={cn(
        "flex min-w-0 items-stretch gap-3 rounded-2xl border border-border/60 border-l-4 border-l-sky-600 bg-sky-50/40 shadow-sm"
      )}
    >
      <div className="flex shrink-0 items-center pl-4">
        <Sparkles
          className="size-5 text-sky-800"
          strokeWidth={APP_ICON_STROKE}
          absoluteStrokeWidth
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={
            microsoft.pendingTriage > 0
              ? "/microsoft?tab=triage"
              : "/microsoft?tab=inbox"
          }
          className="block px-3.5 py-1.5 transition-colors hover:bg-muted/30"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            O365 Mail
          </p>
          <p className="truncate text-[14px] font-black tracking-tight">
            {mailAnalyseLine(microsoft)}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {microsoft.pendingTriage > 0
              ? `${microsoft.pendingTriage} offen`
              : microsoft.analyzedToday > 0
                ? `${microsoft.analyzedToday} heute`
                : "Outlook"}
            {msTime ? ` · ${msTime}` : ""}
          </p>
        </Link>
        <div className="mx-3.5 border-t border-border/70" aria-hidden />
        <Link
          href={
            google.pendingTriage > 0 ? "/google?tab=triage" : "/google"
          }
          className="block px-3.5 py-1.5 transition-colors hover:bg-muted/30"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Google Workspace
          </p>
          <p className="truncate text-[14px] font-black tracking-tight">
            {mailAnalyseLine(google)}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {google.pendingTriage > 0
              ? `${google.pendingTriage} offen`
              : google.analyzedToday > 0
                ? `${google.analyzedToday} heute`
                : "Gmail"}
            {gTime ? ` · ${gTime}` : ""}
          </p>
        </Link>
      </div>
    </div>
  );
}

function mailInboxSample(items: MailListItem[]): MailListItem | null {
  const unread = items.find((m) => m.unread);
  return unread || items[0] || null;
}

function mailReceivedLabel(item: MailListItem | null): string | null {
  if (!item) return null;
  const raw = item.date || item.internalDate;
  if (!raw) return null;
  const iso =
    /^\d+$/.test(raw) ? new Date(Number(raw)).toISOString() : raw;
  return formatMailAnalyseTime(iso);
}

function InboxFocusTile({
  google,
  microsoft,
}: {
  google: MailListItem[];
  microsoft: MailListItem[];
}) {
  const ms = mailInboxSample(microsoft);
  const g = mailInboxSample(google);
  const msTime = mailReceivedLabel(ms);
  const gTime = mailReceivedLabel(g);

  return (
    <div className="flex min-w-0 items-stretch gap-2.5 rounded-2xl border border-border/60 border-l-4 border-l-amber-500 bg-amber-50/40 shadow-sm">
      <div className="flex shrink-0 items-center pl-3.5">
        <Mail
          className="size-5 text-amber-800"
          strokeWidth={APP_ICON_STROKE}
          absoluteStrokeWidth
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={
            ms
              ? `/microsoft?tab=inbox&open=${encodeURIComponent(ms.id)}`
              : "/microsoft?tab=inbox"
          }
          className="block px-3.5 py-1.5 transition-colors hover:bg-muted/30"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            O365 Mail
          </p>
          <p className="truncate text-[14px] font-black tracking-tight">
            {ms ? ms.subject || "(kein Betreff)" : "Keine Mails"}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {ms
              ? `${ms.fromName}${ms.unread ? " · neu" : ""}`
              : "Outlook"}
            {msTime ? ` · ${msTime}` : ""}
          </p>
        </Link>
        <div className="mx-3.5 border-t border-border/70" aria-hidden />
        <Link
          href={
            g ? `/google?open=${encodeURIComponent(g.id)}` : "/google"
          }
          className="block px-3.5 py-1.5 transition-colors hover:bg-muted/30"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Google Workspace
          </p>
          <p className="truncate text-[14px] font-black tracking-tight">
            {g ? g.subject || "(kein Betreff)" : "Keine Mails"}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {g ? `${g.fromName}${g.unread ? " · neu" : ""}` : "Gmail"}
            {gTime ? ` · ${gTime}` : ""}
          </p>
        </Link>
      </div>
    </div>
  );
}

function TermineFocusTile({
  items,
  today,
}: {
  items: AgendaItem[];
  today: string;
}) {
  const [first, second] = items;

  function row(item: AgendaItem | undefined, label: string) {
    const titleLine = !item
      ? "Keine Termine"
      : item.date === today
        ? [item.time, item.title].filter(Boolean).join(" · ")
        : item.date > today
          ? [
              `Morgen${item.time ? ` · ${item.time}` : ""}`,
              item.title,
            ]
              .filter(Boolean)
              .join(" · ")
          : item.title;
    return (
      <Link
        href={item ? itemHref(item) : "/calendar"}
        className="block px-3.5 py-1.5 transition-colors hover:bg-muted/30"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-[14px] font-black tracking-tight">
          {titleLine}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {item
            ? [
                shortPlace(item),
                item.driveLabel,
              ]
                .filter(Boolean)
                .join(" · ") ||
              item.subtitle ||
              "Kalender"
            : "Kalender öffnen"}
        </p>
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 items-stretch gap-2.5 rounded-2xl border border-border/60 border-l-4 border-l-emerald-600 bg-emerald-50/40 shadow-sm">
      <div className="flex shrink-0 items-center pl-3.5">
        <CalendarDays
          className="size-5 text-emerald-800"
          strokeWidth={APP_ICON_STROKE}
          absoluteStrokeWidth
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        {row(first, "Nächster Termin")}
        <div className="mx-3.5 border-t border-border/70" aria-hidden />
        {row(second, "Danach")}
      </div>
    </div>
  );
}

const OVERVIEW_LS_KEY = "buddy-overview-cache-v2";
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
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
      if (isBirthdayItem(item)) continue;
      byId.set(item.id, item);
    }
    for (const item of data.agenda || []) {
      if (item.date !== today) continue;
      if (isBirthdayItem(item)) continue;
      byId.set(item.id, item);
    }
    const merged = [...byId.values()].sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
    return filterAblaufTimelineItems(merged, today, nowHm, 30);
  }, [data, today, nowHm]);

  const nextFocusEvents = useMemo(
    () => pickNextUpcomingAgendaItems(timelineItems, today, nowHm, 2),
    [timelineItems, today, nowHm]
  );

  const activeId =
    useMemo(
      () => pickActiveTimelineItem(timelineItems, today, nowHm)?.id ?? null,
      [timelineItems, today, nowHm]
    );

  const conflicts = useMemo(
    () => findConflicts(timelineItems, today, nowHm),
    [timelineItems, today, nowHm]
  );

  const CONFLICT_MUTE_KEY = "buddy-conflicts-muted-ymd";
  const [conflictsMutedYmd, setConflictsMutedYmd] = useState<string | null>(
    null
  );
  useEffect(() => {
    try {
      setConflictsMutedYmd(localStorage.getItem(CONFLICT_MUTE_KEY));
    } catch {
      setConflictsMutedYmd(null);
    }
  }, [today]);

  const visibleConflicts =
    conflictsMutedYmd === today ? [] : conflicts;

  function muteConflictsForToday() {
    try {
      localStorage.setItem(CONFLICT_MUTE_KEY, today);
    } catch {
      /* ignore */
    }
    setConflictsMutedYmd(today);
  }

  const upcomingBirthdays = useMemo(
    () => (data ? collectUpcomingBirthdays(data, today) : []),
    [data, today]
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

  const mailFocusGoogle = (data?.todayMail || []) as MailListItem[];
  const mailFocusMicrosoft = (data?.todayMailMicrosoft ||
    []) as MailListItem[];

  return (
    <div className="min-w-0 space-y-6 pb-10">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[30px] font-black tracking-tight">
              {greeting}
              {greetingName ? `, ${greetingName}` : ""}
            </h1>
            {refreshing || fromCache ? (
              <p className="text-[12px] text-muted-foreground">
                {refreshing ? "Aktualisiere…" : "Zwischengespeicherte Ansicht"}
              </p>
            ) : null}
          </div>
          <p className="text-[15px] capitalize text-muted-foreground">
            {formatLongDeDate()}
          </p>
          {data?.briefing ? (
            <div className="space-y-1.5 pt-1">
              <p className="text-[15px] font-medium leading-snug text-foreground/90">
                {data.briefing.headline}
              </p>
              {data.briefing.prose ? (
                <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                  {data.briefing.prose}
                </p>
              ) : data.briefing.detail ? (
                <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                  {data.briefing.detail}
                </p>
              ) : null}
              {data.briefing.mode === "evening" &&
              (data.briefing.done.length > 0 ||
                data.briefing.open.length > 0) ? (
                <div className="grid max-w-2xl gap-3 pt-1 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Erledigt
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[13px] text-foreground/85">
                      {data.briefing.done.map((line) => (
                        <li key={`done-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Offen
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[13px] text-foreground/85">
                      {data.briefing.open.map((line) => (
                        <li key={`open-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {data?.homeWeather ? (
          <div className="min-w-0 lg:justify-self-end">
            <HomeWeatherWidget weather={data.homeWeather} />
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="text-[15px] text-destructive">{error}</p>
      ) : null}

      {loading && !data ? <OverviewSkeleton /> : null}

      {data ? (
        <>
          <section className="space-y-2">
            <h2 className="text-[14px] font-black tracking-tight text-foreground">
              Heute handeln
            </h2>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card text-sm">
              {(() => {
                const rows: Array<{
                  key: string;
                  href: string;
                  label: string;
                  meta: string;
                }> = [];
                for (const ev of nextFocusEvents.slice(0, 2)) {
                  rows.push({
                    key: `ev-${ev.id}`,
                    href: "/calendar",
                    label: ev.title,
                    meta: `${ev.time || "ganztags"}${ev.location ? ` · ${ev.location}` : ""} · Termin`,
                  });
                }
                if (data.chips.openDueCount > 0) {
                  rows.push({
                    key: "finance-open",
                    href: "/finance",
                    label: `${data.chips.openDueCount} offene Zahlung${data.chips.openDueCount === 1 ? "" : "en"}`,
                    meta: `${formatCHF(data.chips.openDueAmount)} · Finanzen`,
                  });
                }
                const msPending =
                  data.chips.mailByProvider?.microsoft?.pendingTriage || 0;
                const gPending =
                  data.chips.mailByProvider?.google?.pendingTriage || 0;
                if (msPending > 0) {
                  const sample = mailFocusMicrosoft[0]?.subject;
                  rows.push({
                    key: "ms-triage",
                    href: "/microsoft?tab=triage",
                    label: sample
                      ? `O365: ${sample}`
                      : `${msPending} O365-Mail zur Triage`,
                    meta: `${msPending} offen · Outlook`,
                  });
                }
                if (gPending > 0) {
                  const sample = mailFocusGoogle[0]?.subject;
                  rows.push({
                    key: "g-triage",
                    href: "/google?tab=triage",
                    label: sample
                      ? `Workspace: ${sample}`
                      : `${gPending} Gmail zur Triage`,
                    meta: `${gPending} offen · Gmail`,
                  });
                }
                if (rows.length === 0) {
                  rows.push({
                    key: "empty",
                    href: "/calendar",
                    label: "Nichts Dringendes",
                    meta: "Agenda & Postfächer sind ruhig",
                  });
                }
                return rows.slice(0, 6).map((row) => (
                  <li key={row.key}>
                    <Link
                      href={row.href}
                      className="flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {row.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.meta}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        →
                      </span>
                    </Link>
                  </li>
                ));
              })()}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-[14px] font-black tracking-tight text-foreground">
              Heute im Fokus
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TermineFocusTile items={nextFocusEvents} today={today} />
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
              <InboxFocusTile
                google={mailFocusGoogle}
                microsoft={mailFocusMicrosoft}
              />
              <MailAnalyseFocusTile
                google={
                  data.chips.mailByProvider?.google ?? {
                    analyzedToday: 0,
                    pendingTriage: 0,
                    lastAnalyzedAt: null,
                  }
                }
                microsoft={
                  data.chips.mailByProvider?.microsoft ?? {
                    analyzedToday: 0,
                    pendingTriage: 0,
                    lastAnalyzedAt: null,
                  }
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[14px] font-black tracking-tight text-foreground">
              Aufgaben
            </h2>
            <HomeTasksSection
              items={(data.tasks?.items || []).map((t) => ({
                key: t.key || `${t.source || "google"}:${t.id}`,
                id: t.id,
                source: t.source || "google",
                title: t.title,
                dueDate: t.dueDate,
                overdue: t.overdue,
                subtitle: t.subtitle || t.listTitle || "",
                href: t.href,
                listId: t.listId ?? null,
                etag: t.etag ?? null,
              }))}
              today={today}
              hasGoogleScope={Boolean(data.tasks?.hasGoogleScope)}
              hasMicrosoftScope={Boolean(data.tasks?.hasMicrosoftScope)}
              onChanged={() => void load()}
            />
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.85fr)]">
            <section className="min-w-0 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[14px] font-black tracking-tight">
                  Heute · Ablauf
                </h2>
                <Link
                  href="/calendar"
                  className="text-[13px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Alle Termine →
                </Link>
              </div>
              {visibleConflicts.length > 0 ? (
                <div
                  className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-950"
                  role="status"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-700"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Termin-Konflikt</p>
                    <ul className="mt-0.5 space-y-0.5 text-amber-900/90">
                      {visibleConflicts.slice(0, 2).map((c) => (
                        <li key={c.id} className="truncate">
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-[12px] text-amber-900/80 hover:bg-amber-100/80 hover:text-amber-950"
                    onClick={muteConflictsForToday}
                    title="Für heute ausblenden"
                  >
                    <X className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only sm:ml-1">
                      Heute ok
                    </span>
                  </Button>
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
              <BirthdaysAsideCard items={upcomingBirthdays} today={today} />

              {data.referenceNotes && data.referenceNotes.length > 0 ? (
                <Card className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-[16px] font-black">
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
                            <p className="truncate text-[14px] font-black">
                              {n.title}
                            </p>
                            <p className="truncate font-mono text-[12px] text-muted-foreground">
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
                    <CardTitle className="text-[16px] font-black">Kennzahlen</CardTitle>
                    <div className="flex flex-wrap gap-1">
                      {PERIODS.map((p) => (
                        <Button
                          key={p.id}
                          type="button"
                          size="sm"
                          variant={period === p.id ? "default" : "ghost"}
                          className={cn(
                            "h-7 px-2 text-[13px]",
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
                  <p className="text-[25px] font-semibold tabular-nums">
                    {formatCHF(data.kpi.total)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Ausgaben · {PERIODS.find((p) => p.id === period)?.label}
                  </p>
                  <div className="space-y-2">
                    {data.kpi.byCategory.slice(0, 5).map((slice) => (
                      <div key={slice.category} className="space-y-1">
                        <div className="flex justify-between text-[13px]">
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
                      <p className="text-[13px] text-muted-foreground">
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
                      className="inline-flex h-8 items-center text-[13px] font-medium text-[var(--brand-finance)] underline-offset-2 hover:underline"
                    >
                      Analyse →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>

          <section className="space-y-3">
            <h2 className="text-[14px] font-black tracking-tight">
              Später im Monat
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <Link
                href="/travel"
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 hover:bg-muted/30"
              >
                <Plane className="mt-0.5 size-4 shrink-0 text-sky-700" />
                <div className="min-w-0">
                  <p className="text-[14px] font-black">
                    Reisen · {laterCounts.travel}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
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
                  <p className="text-[14px] font-black">
                    Fristen · {laterCounts.deadlines || data.chips.urgentDeadlines}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
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
                  <p className="text-[14px] font-black">
                    Pipeline · {laterCounts.pipeline}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {laterCounts.pipelineSample || "Keine geplanten Zahlungen"}
                  </p>
                </div>
              </Link>
            </div>
            {data.chips.triagePending > 0 ? (
              <Link
                href="/inbox"
                className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
              >
                <Mail className="size-3.5" />
                {data.chips.triagePending} Triage in der Inbox →
              </Link>
            ) : null}
          </section>

          <div className="grid gap-4 pt-2 md:grid-cols-2">
            <BackupStatusPanel />
            <SystemStatusCard data={data} />
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
        onChanged={() => void load()}
      />
    </div>
  );
}
