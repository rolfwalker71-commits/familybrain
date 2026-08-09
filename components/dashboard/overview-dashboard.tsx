"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  Trophy,
  Wallet,
  ChevronRight,
  Plane,
  ListChecks,
  StickyNote,
  X,
  Cake,
  Video,
  MapPin,
  AlertTriangle,
  Car,
  CheckCircle2,
  Monitor,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupStatusPanel } from "@/components/settings/backup-status-panel";
import { HomeTasksSection } from "@/components/dashboard/home-tasks-section";
import {
  GmailLogo,
  GoogleDriveLogo,
  GoogleLogo,
  MicrosoftLogo,
  MicrosoftPlannerLogo,
  MicrosoftTeamsLogo,
} from "@/components/branding/provider-logos";
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
import { statusChipClass } from "@/lib/mari/status";
import type { LucideIcon } from "lucide-react";

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
    <div className="w-full min-w-0 rounded-2xl border border-white/70 bg-white/95 px-3.5 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:max-w-md sm:px-4 sm:py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <span className="text-[2.25rem] leading-none" aria-hidden>
            {weather.icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold tracking-tight text-foreground">
                {weather.placeLabel}
              </p>
              <p className="truncate text-[12px] capitalize text-muted-foreground">
                {weather.weatherLabelDe}
              </p>
            </div>
            <p className="shrink-0 text-[28px] font-bold tabular-nums leading-none tracking-tight text-foreground">
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
          className="mt-2.5 grid gap-0.5 border-t border-border/50 pt-2"
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
                i === 0 && "bg-sky-50"
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

function driveStatusMeta(drive: OverviewPayload["driveMirror"]): {
  label: string;
  ok: boolean;
  percent: number | null;
} {
  if (!drive) return { label: "Unbekannt", ok: false, percent: null };
  if (!drive.connected) return { label: "Nicht verbunden", ok: false, percent: null };
  if (!drive.hasDriveScope)
    return { label: "Recht fehlt", ok: false, percent: null };
  if (!drive.enabled) return { label: "Aus", ok: false, percent: drive.percent };
  if (drive.complete)
    return { label: "Synchronisiert", ok: true, percent: drive.percent };
  return {
    label: `${drive.percent}%`,
    ok: false,
    percent: drive.percent,
  };
}

function DriveAsideCard({ data }: { data: OverviewPayload }) {
  const meta = driveStatusMeta(data.driveMirror);
  return (
    <Link
      href="/account"
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-3.5 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.05)] transition-colors hover:bg-muted/30"
    >
      <GoogleDriveLogo className="size-5" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-black tracking-tight">Drive</p>
        <p className="truncate text-[12px] text-muted-foreground">{meta.label}</p>
      </div>
      {meta.ok ? (
        <CheckCircle2
          className="size-5 shrink-0 text-emerald-600"
          strokeWidth={APP_ICON_STROKE}
          absoluteStrokeWidth
          aria-label="OK"
        />
      ) : (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </Link>
  );
}

/** Systemstatus mit Markenlogos (Mockup). */
function SystemStatusCard({ data }: { data: OverviewPayload }) {
  const drive = driveStatusMeta(data.driveMirror);
  const msOk = Boolean(data.tasks?.microsoftConnected);
  const gOk = Boolean(data.tasks?.googleConnected);
  const plannerOk = Boolean(data.tasks?.hasMicrosoftScope);
  const allOk = msOk && gOk && drive.ok && plannerOk;

  const rows: Array<{
    key: string;
    label: string;
    ok: boolean;
    logo: ReactNode;
    href: string;
  }> = [
    {
      key: "o365",
      label: "O365",
      ok: msOk,
      logo: <MicrosoftLogo className="size-4" />,
      href: "/microsoft",
    },
    {
      key: "google",
      label: "Google Workspace",
      ok: gOk,
      logo: <GoogleLogo className="size-4" />,
      href: "/google",
    },
    {
      key: "drive",
      label: "Drive",
      ok: drive.ok,
      logo: <GoogleDriveLogo className="size-4" />,
      href: "/account",
    },
    {
      key: "planner",
      label: "Planner",
      ok: plannerOk,
      logo: <MicrosoftPlannerLogo className="size-4" />,
      href: "/microsoft?tab=planner",
    },
  ];

  return (
    <Card className="border-border/60 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[16px] font-black">
          <Monitor
            className="size-4 text-muted-foreground"
            strokeWidth={APP_ICON_STROKE}
            absoluteStrokeWidth
            aria-hidden
          />
          Systemstatus
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground/90 hover:underline"
              >
                {row.logo}
                <span>{row.label}</span>
                {row.ok ? (
                  <CheckCircle2
                    className="size-3.5 text-emerald-600"
                    aria-label="OK"
                  />
                ) : (
                  <span className="text-[11px] font-semibold text-amber-700">
                    —
                  </span>
                )}
              </Link>
            </li>
          ))}
          <li
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold",
              allOk ? "text-emerald-700" : "text-amber-800"
            )}
          >
            {allOk ? (
              <>
                <CheckCircle2 className="size-3.5" aria-hidden />
                Alle Systeme OK
              </>
            ) : (
              "Prüfen"
            )}
          </li>
        </ul>
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
            Konto
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function NextHockeyCard({ game }: { game: HockeyGameCard }) {
  return (
    <Card className="border-border/60 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
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
    <Card className="border-border/60 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
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

function formatPollAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Datum + Uhrzeit für Inbox-Mails (Gmail Header/Date oder Graph receivedDateTime). */
function formatMailDateTime(
  item: Pick<MailListItem, "date" | "internalDate"> | null | undefined
): string | null {
  if (!item) return null;
  let d: Date | null = null;
  if (item.date) {
    const parsed = new Date(item.date);
    if (Number.isFinite(parsed.getTime())) d = parsed;
  }
  if (!d && item.internalDate) {
    const n = Number(item.internalDate);
    if (Number.isFinite(n) && n > 0) d = new Date(n);
  }
  if (!d) return null;
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function MariTicketsAsideCard({
  data,
}: {
  data: NonNullable<OverviewPayload["mariTickets"]>;
}) {
  if (!data.configured) return null;
  const pollLabel = formatPollAt(data.lastPollAt);

  return (
    <Card className="border-border/60 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[16px] font-black">
          <Ticket
            className="size-4 text-orange-700"
            strokeWidth={APP_ICON_STROKE}
            absoluteStrokeWidth
            aria-hidden
          />
          Tickets von mir
        </CardTitle>
        <p className="text-[12px] text-muted-foreground">
          {data.employeeNumber
            ? `${data.employeeNumber} · ${data.total} offen`
            : `${data.total} offen`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.countsByStatus.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {data.countsByStatus.map((c) => (
              <li key={c.statusId}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    statusChipClass(c.statusId)
                  )}
                >
                  {c.label}
                  <span className="tabular-nums opacity-80">{c.count}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            {data.lastPollAt
              ? "Keine offenen Support-Tickets."
              : "Noch kein Poll — Scheduler lädt gleich."}
          </p>
        )}

        {data.recentChanges.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Letzte Änderungen
            </p>
            <ul className="space-y-1.5">
              {data.recentChanges.slice(0, 6).map((ch, i) => (
                <li
                  key={`${ch.issueId}-${ch.at}-${i}`}
                  className="min-w-0 text-[12px] leading-snug"
                >
                  <span className="font-semibold tabular-nums">
                    #{ch.issueId}
                  </span>{" "}
                  <span className="text-muted-foreground">{ch.detail}</span>
                  {ch.title ? (
                    <span className="mt-0.5 block truncate text-[11px] text-foreground/80">
                      {ch.title}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <Link
            href="/maringo"
            className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            Maringo →
          </Link>
          <p className="text-[10px] text-muted-foreground">
            {pollLabel
              ? `Zuletzt geprüft: ${pollLabel}`
              : "Noch nicht geprüft"}
          </p>
        </div>
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
                "mb-5 min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)] last:mb-1",
                active && "border-emerald-200/90 shadow-[0_4px_18px_rgba(5,150,105,0.12)]",
                !active &&
                  item.calendarId?.startsWith("google-cal:") &&
                  "border-sky-200/80 bg-sky-50/35",
                !active &&
                  item.calendarId?.startsWith("ms-cal:") &&
                  "border-violet-200/70 bg-violet-50/30"
              )}
            >
              <div className="flex items-stretch">
                <AgendaTypeRail item={item} className="w-9 sm:w-[3.25rem]" />
                <div
                  className={cn(
                    "flex min-w-0 flex-1 items-stretch gap-2",
                    active && "bg-emerald-50/40"
                  )}
                >
                  <div className="min-w-0 flex-1 px-3 py-2.5">
                    <button
                      type="button"
                      className="w-full text-left hover:opacity-90"
                      onClick={() => onSelect(item)}
                    >
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
                    </button>

                    {item.meetUrl || item.mapsUrl || showMap ? (
                      <div className="mt-2.5 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {item.meetUrl ? (
                            (() => {
                              const isTeams =
                                /teams\.microsoft\.com|microsoft365\.com\/teams/i.test(
                                  item.meetUrl
                                );
                              return (
                                <a
                                  href={item.meetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 text-[12px] font-medium text-foreground shadow-sm hover:bg-muted/50"
                                >
                                  {isTeams ? (
                                    <MicrosoftTeamsLogo className="size-3.5" />
                                  ) : (
                                    <Video className="size-3.5" aria-hidden />
                                  )}
                                  {isTeams ? "In Teams öffnen" : "Meet"}
                                </a>
                              );
                            })()
                          ) : null}
                          {item.mapsUrl ? (
                            <a
                              href={item.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 text-[12px] font-medium text-foreground shadow-sm hover:bg-muted/50"
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

                  <div className="flex shrink-0 flex-col items-end justify-between gap-2 py-2.5 pr-2.5">
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
                      showAiBadge
                      className="shadow-md"
                      imgClassName="h-[4.5rem] w-[5.25rem] sm:h-[5rem] sm:w-[6rem]"
                    />
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground"
                      aria-label="Details"
                      onClick={() => onSelect(item)}
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </div>
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
  logo,
  eyebrow,
  title,
  detail,
}: {
  href: string;
  tone: "teal" | "rose" | "amber" | "sky";
  icon?: LucideIcon;
  logo?: ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  const cardCls = {
    teal: "border-teal-200/70 bg-teal-50/60",
    rose: "border-rose-200/70 bg-rose-50/60",
    amber: "border-amber-200/70 bg-amber-50/60",
    sky: "border-sky-200/70 bg-sky-50/60",
  }[tone];
  const iconWrap = {
    teal: "bg-teal-100/80 text-teal-800",
    rose: "bg-rose-100/80 text-rose-800",
    amber: "bg-amber-100/80 text-amber-800",
    sky: "bg-sky-100/80 text-sky-800",
  }[tone];

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.04)] transition-colors hover:brightness-[0.98]",
        cardCls
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          iconWrap
        )}
      >
        {logo ? (
          logo
        ) : Icon ? (
          <Icon
            className="size-4"
            strokeWidth={APP_ICON_STROKE}
            absoluteStrokeWidth
            aria-hidden
          />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <p className="truncate text-[15px] font-black tracking-tight">{title}</p>
        <p className="truncate text-[13px] text-muted-foreground">{detail}</p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/70"
        aria-hidden
      />
    </Link>
  );
}

function mailInboxSample(items: MailListItem[]): MailListItem | null {
  const unread = items.find((m) => m.unread);
  return unread || items[0] || null;
}

function overviewStatusLine(
  data: OverviewPayload,
  todayEventCount: number
): string {
  const parts: string[] = [];
  parts.push(
    todayEventCount === 0
      ? "Keine Termine heute"
      : todayEventCount === 1
        ? "1 Termin heute"
        : `${todayEventCount} Termine heute`
  );
  const triage =
    (data.chips.mailByProvider?.microsoft?.pendingTriage || 0) +
    (data.chips.mailByProvider?.google?.pendingTriage || 0);
  if (triage > 0) {
    parts.push(`${triage} Mail-Triage`);
  } else if (data.briefing?.headline) {
    /* keep compact — skip long briefing */
  }
  const drive = data.driveMirror;
  if (drive && drive.connected && drive.hasDriveScope && drive.enabled) {
    parts.push(`Drive ${drive.percent}%`);
  }
  return parts.join(" · ");
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
  const [period] = useState<OverviewPeriod>("month");
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const mailFocusGoogle = (data?.todayMail || []) as MailListItem[];
  const mailFocusMicrosoft = (data?.todayMailMicrosoft ||
    []) as MailListItem[];
  const todayEventCount = (data?.todayCalendar || []).length;
  const nextEvent = nextFocusEvents[0];
  const msMailStats = data?.chips.mailByProvider?.microsoft;
  const gMailStats = data?.chips.mailByProvider?.google;
  const msSample = mailInboxSample(mailFocusMicrosoft);
  const gSample = mailInboxSample(mailFocusGoogle);

  return (
    <div className="min-w-0 space-y-6 pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-border/40 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/overview-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-white/92 via-white/78 to-white/45"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-white/55 via-transparent to-sky-50/30"
          aria-hidden
        />
        <div className="relative grid gap-4 px-4 py-6 sm:px-6 sm:py-7 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-start lg:gap-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-[30px] font-black tracking-tight text-foreground drop-shadow-sm sm:text-[32px]">
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
            {data ? (
              <p className="pt-1 text-[13px] text-muted-foreground">
                {overviewStatusLine(data, todayEventCount)}
              </p>
            ) : null}
            {data?.briefing?.mode === "evening" &&
            (data.briefing.done.length > 0 ||
              data.briefing.open.length > 0) ? (
              <div className="grid max-w-2xl gap-3 pt-2 sm:grid-cols-2">
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
          {data?.homeWeather ? (
            <div className="min-w-0 lg:justify-self-end">
              <HomeWeatherWidget weather={data.homeWeather} />
            </div>
          ) : null}
        </div>
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
            <ul className="space-y-2">
              {(() => {
                const rows: Array<{
                  key: string;
                  href: string;
                  label: string;
                  when?: string | null;
                  tone: "teal" | "amber" | "rose" | "sky";
                  icon: LucideIcon | "teams" | "ms" | "gmail";
                }> = [];
                for (const ev of nextFocusEvents.slice(0, 2)) {
                  const isTeams =
                    ev.meetUrl &&
                    /teams\.microsoft\.com|microsoft365\.com\/teams/i.test(
                      ev.meetUrl
                    );
                  rows.push({
                    key: `ev-${ev.id}`,
                    href: "/calendar",
                    label: [
                      ev.title,
                      ev.time || null,
                      isTeams ? "Teams" : null,
                    ]
                      .filter(Boolean)
                      .join(" "),
                    tone: "teal",
                    icon: isTeams ? "teams" : CalendarDays,
                  });
                }
                if (data.chips.openDueCount > 0) {
                  rows.push({
                    key: "finance-open",
                    href: "/finance",
                    label: `${data.chips.openDueCount} offene Zahlung${data.chips.openDueCount === 1 ? "" : "en"} · ${formatCHF(data.chips.openDueAmount)}`,
                    tone: "rose",
                    icon: Wallet,
                  });
                }
                const msPending =
                  data.chips.mailByProvider?.microsoft?.pendingTriage || 0;
                const gPending =
                  data.chips.mailByProvider?.google?.pendingTriage || 0;
                if (msPending > 0) {
                  const sample = mailFocusMicrosoft[0];
                  rows.push({
                    key: "ms-triage",
                    href: "/microsoft?tab=triage",
                    label:
                      sample?.subject || `${msPending} O365-Mail zur Triage`,
                    when: formatMailDateTime(sample),
                    tone: "amber",
                    icon: "ms",
                  });
                }
                if (gPending > 0) {
                  const sample = mailFocusGoogle[0];
                  rows.push({
                    key: "g-triage",
                    href: "/google?tab=triage",
                    label:
                      sample?.subject || `${gPending} Gmail zur Triage`,
                    when: formatMailDateTime(sample),
                    tone: "sky",
                    icon: "gmail",
                  });
                }
                if (rows.length === 0) {
                  rows.push({
                    key: "empty",
                    href: "/calendar",
                    label: "Nichts Dringendes — Agenda & Postfächer ruhig",
                    tone: "teal",
                    icon: CalendarDays,
                  });
                }
                const rail = {
                  teal: "border-l-teal-600",
                  amber: "border-l-amber-500",
                  rose: "border-l-rose-500",
                  sky: "border-l-sky-500",
                } as const;
                return rows.slice(0, 6).map((row) => (
                  <li key={row.key}>
                    <Link
                      href={row.href}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border border-border/60 border-l-[3px] bg-card px-3 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.05)] transition-colors hover:bg-muted/30",
                        rail[row.tone]
                      )}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/50">
                        {row.icon === "teams" ? (
                          <MicrosoftTeamsLogo className="size-4" />
                        ) : row.icon === "ms" ? (
                          <MicrosoftLogo className="size-4" />
                        ) : row.icon === "gmail" ? (
                          <GmailLogo className="size-4" />
                        ) : (
                          <row.icon
                            className="size-4 text-muted-foreground"
                            strokeWidth={APP_ICON_STROKE}
                            absoluteStrokeWidth
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                        {row.label}
                      </span>
                      {row.when ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {row.when}
                        </span>
                      ) : null}
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/70"
                        aria-hidden
                      />
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
              <FocusTile
                href={nextEvent ? itemHref(nextEvent) : "/calendar"}
                tone="teal"
                icon={CalendarDays}
                eyebrow="Nächster Termin"
                title={nextEvent?.title || "Keine Termine"}
                detail={
                  nextEvent
                    ? [
                        nextEvent.time && nextEvent.endTime
                          ? `${nextEvent.time}–${nextEvent.endTime}`
                          : nextEvent.time ||
                            (nextEvent.date === today ? "Heute" : weekdayLabel(nextEvent.date)),
                        shortPlace(nextEvent),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Kalender"
                    : "Kalender öffnen"
                }
              />
              <FocusTile
                href="/finance"
                tone="rose"
                icon={Wallet}
                eyebrow="Finanzen offen"
                title={
                  data.chips.openDueCount > 0
                    ? `${data.chips.openDueCount} Beleg${data.chips.openDueCount === 1 ? "" : "e"}`
                    : "Nichts offen"
                }
                detail={
                  data.chips.openDueCount > 0
                    ? formatCHF(data.chips.openDueAmount)
                    : "Finanzen im Blick"
                }
              />
              <FocusTile
                href={
                  (msMailStats?.pendingTriage || 0) > 0
                    ? "/microsoft?tab=triage"
                    : msSample
                      ? `/microsoft?tab=triage&open=${encodeURIComponent(msSample.id)}`
                      : "/microsoft?tab=mail&view=chronik"
                }
                tone="amber"
                logo={<MicrosoftLogo className="size-5" />}
                eyebrow="O365 Mail"
                title={
                  (msMailStats?.pendingTriage || 0) > 0
                    ? `${msMailStats!.pendingTriage} Mail-Triage`
                    : msSample
                      ? msSample.subject || "(kein Betreff)"
                      : "Posteingang"
                }
                detail={
                  (msMailStats?.pendingTriage || 0) > 0
                    ? [
                        "Priorität: Normal",
                        formatMailDateTime(mailFocusMicrosoft[0]),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : msSample
                      ? [
                          msSample.fromName || "Outlook",
                          formatMailDateTime(msSample),
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Keine wichtigen"
                }
              />
              <FocusTile
                href={
                  (gMailStats?.pendingTriage || 0) > 0
                    ? "/google?tab=triage"
                    : gSample
                      ? `/google?tab=triage&open=${encodeURIComponent(gSample.id)}`
                      : "/google?tab=mail&view=chronik"
                }
                tone="sky"
                logo={<GmailLogo className="size-5" />}
                eyebrow="Google Mail"
                title={
                  (gMailStats?.pendingTriage || 0) > 0
                    ? `${gMailStats!.pendingTriage} Mail-Triage`
                    : "Posteingang"
                }
                detail={
                  (gMailStats?.pendingTriage || 0) > 0
                    ? [
                        "Zur Prüfung",
                        formatMailDateTime(mailFocusGoogle[0]),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : gSample?.unread
                      ? [
                          gSample.subject || "Ungelesen",
                          formatMailDateTime(gSample),
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Keine wichtigen"
                }
              />
            </div>
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
              <Card className="border-border/60 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
                <CardContent className="px-3 py-3 sm:px-5 sm:py-4">
                  <DayTimeline
                    items={timelineItems}
                    activeId={activeId}
                    today={today}
                    onSelect={setEventDetail}
                  />
                </CardContent>
              </Card>

              <div className="space-y-3 pt-2">
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
                    accountLabel: t.accountLabel ?? null,
                    bucketLabel: t.bucketLabel ?? null,
                    href: t.href,
                    listId: t.listId ?? null,
                    etag: t.etag ?? null,
                    listTitle: t.listTitle,
                    planId: t.planId ?? null,
                    bucketId: t.bucketId ?? null,
                  }))}
                  today={today}
                  hasGoogleScope={Boolean(data.tasks?.hasGoogleScope)}
                  hasMicrosoftScope={Boolean(data.tasks?.hasMicrosoftScope)}
                  onChanged={() => void load()}
                />
              </div>
            </section>

            <aside className="min-w-0 space-y-4">
              <BirthdaysAsideCard items={upcomingBirthdays} today={today} />

              {data.mariTickets?.configured ? (
                <MariTicketsAsideCard data={data.mariTickets} />
              ) : null}

              {data.referenceNotes && data.referenceNotes.length > 0 ? (
                <Card className="border-border/60 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
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

              <DriveAsideCard data={data} />
            </aside>
          </div>

          <section className="space-y-3">
            <h2 className="text-[14px] font-black tracking-tight">
              Später im Monat
            </h2>
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)] sm:flex-row sm:divide-x sm:divide-border/60">
              <Link
                href="/travel"
                className="flex flex-1 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30"
              >
                <Plane className="size-4 shrink-0 text-sky-700" />
                <div className="min-w-0">
                  <p className="text-[14px] font-black">Reisen</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {laterCounts.travel > 0
                      ? `${laterCounts.travel} · ${laterCounts.travelSample || "geplant"}`
                      : "Keine Reisen geplant"}
                  </p>
                </div>
              </Link>
              <Link
                href="/deadlines"
                className="flex flex-1 items-center gap-3 border-t border-border/60 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:border-t-0"
              >
                <Clock3 className="size-4 shrink-0 text-teal-700" />
                <div className="min-w-0">
                  <p className="text-[14px] font-black">Fristen</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {laterCounts.deadlines || data.chips.urgentDeadlines
                      ? `${laterCounts.deadlines || data.chips.urgentDeadlines} · ${laterCounts.deadlineSample || "offen"}`
                      : "Keine offenen Fristen"}
                  </p>
                </div>
              </Link>
              <Link
                href="/finance"
                className="flex flex-1 items-center gap-3 border-t border-border/60 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:border-t-0"
              >
                <ListChecks className="size-4 shrink-0 text-[var(--brand-finance)]" />
                <div className="min-w-0">
                  <p className="text-[14px] font-black">Pipeline</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {laterCounts.pipeline > 0
                      ? `${laterCounts.pipeline} · ${laterCounts.pipelineSample || "Zahlungen"}`
                      : "Keine geplanten Zahlungen"}
                  </p>
                </div>
              </Link>
            </div>
          </section>

          <div className="grid gap-4 pt-2 md:grid-cols-2">
            <BackupStatusPanel />
            <SystemStatusCard data={data} />
          </div>
        </>
      ) : null}

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
