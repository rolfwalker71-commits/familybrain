"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Flag,
  Inbox,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  STATUS_LABELS,
  WORK_STATUS_IDS,
  statusChipClass,
  statusChipLabel,
} from "@/lib/mari/status";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";
import type { MariTicketAnalysis } from "@/lib/mari/analyze-ticket";
import type {
  MariTicketDetail,
  MariTicketListItem,
  MariTimelineItem,
} from "@/lib/mari/tickets";

function formatTimelineAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
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

function formatDateTimeShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return formatTimelineAt(iso);
}

function formatDateShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const swiss = toSwissDate(iso);
  return swiss === "–" ? null : swiss;
}

/** Nur Tag.Monat für kompakte Listenzeilen */
function formatDayMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const swiss = toSwissDate(iso);
  if (swiss === "–") return null;
  const parts = swiss.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return swiss;
}

function primaryContact(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.split(";")[0]?.trim() || null;
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function joinMeta(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map((p) => p?.trim()).filter(Boolean) as string[];
  return cleaned.length ? cleaned.join(" · ") : null;
}

function StatusChip({
  status,
  statusName,
  className,
}: {
  status: number;
  statusName?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 shrink-0 rounded-full px-2 text-[10px] font-semibold",
        statusChipClass(status),
        className
      )}
    >
      {statusChipLabel(status, statusName)}
    </Badge>
  );
}

function TimelineRow({ item }: { item: MariTimelineItem }) {
  if (item.kind === "change") {
    return (
      <li className="relative pl-8">
        <span className="absolute left-[0.55rem] top-2 size-2.5 rounded-full bg-violet-500 ring-4 ring-background" />
        <div className="inline-flex max-w-full items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] text-violet-950">
          <span className="font-medium">
            {formatTimelineAt(item.at)} · {item.text}
          </span>
        </div>
      </li>
    );
  }

  const inbound =
    item.kind === "inbound" || item.kind === "customer" || item.kind === "system";
  const bubble =
    item.kind === "reply"
      ? "ml-auto border-sky-200/80 bg-sky-50 text-sky-950"
      : item.kind === "system"
        ? "border-violet-200/70 bg-violet-50/60 text-violet-950"
        : "border-border/70 bg-muted/40 text-foreground";
  const dot =
    item.kind === "reply"
      ? "bg-sky-500"
      : item.kind === "inbound" || item.kind === "customer"
        ? "bg-teal-600"
        : "bg-muted-foreground";

  return (
    <li className="relative pl-8">
      <span
        className={cn(
          "absolute left-[0.45rem] top-3 size-3 rounded-full ring-4 ring-background",
          dot
        )}
      />
      <div className={cn("max-w-[92%] space-y-1", item.kind === "reply" && "ml-auto")}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {formatTimelineAt(item.at)} · {item.label}
          {item.actor ? ` · ${item.actor}` : ""}
        </p>
        {item.subject ? (
          <p className="text-[12px] font-medium text-foreground/80">{item.subject}</p>
        ) : null}
        <div
          className={cn(
            "rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
            bubble,
            !inbound && item.kind === "reply" ? "rounded-br-md" : "rounded-bl-md"
          )}
        >
          {item.text || "(kein Text)"}
        </div>
      </div>
    </li>
  );
}

export function MaringoWorkspaceClient() {
  const [statuses, setStatuses] = useState<number[]>([...WORK_STATUS_IDS]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [tickets, setTickets] = useState<MariTicketListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MariTicketDetail | null>(null);
  const [analysis, setAnalysis] = useState<MariTicketAnalysis | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [patching, setPatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [dueDraft, setDueDraft] = useState("");

  const statusParam = useMemo(() => statuses.join(","), [statuses]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (statusParam) q.set("status", statusParam);
      if (overdueOnly) q.set("overdue", "1");
      const res = await fetch(`/api/maringo/tickets?${q}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setConfigured(false);
        setTickets([]);
        setError(data.error || "MARI nicht konfiguriert.");
        return;
      }
      setConfigured(true);
      if (!res.ok) throw new Error(data.error || "Liste fehlgeschlagen");
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTickets([]);
    } finally {
      setListLoading(false);
    }
  }, [statusParam, overdueOnly]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setAnalysis(null);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Detail fehlgeschlagen");
      setDetail(data.ticket as MariTicketDetail);
      const due = (data.ticket as MariTicketDetail)?.dueDate;
      setDueDraft(due ? due.slice(0, 10) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (tickets.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !tickets.some((t) => t.issueId === selectedId)) {
      setSelectedId(tickets[0].issueId);
    }
  }, [tickets, selectedId]);

  function toggleStatus(id: number) {
    setStatuses((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length === 0 ? prev : next;
      }
      return [...prev, id].sort((a, b) => a - b);
    });
  }

  function selectAllWorkStatuses() {
    setStatuses([...WORK_STATUS_IDS]);
    setOverdueOnly(false);
  }

  async function runAnalyze() {
    if (!selectedId) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}/analyze`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setAnalysis(data.analysis as MariTicketAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function patchTicket(body: {
    status?: number;
    dueDate?: string | null;
    priority?: number;
  }) {
    if (!selectedId) return;
    setPatching(true);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Änderung fehlgeschlagen");
      setDetail(data.ticket as MariTicketDetail);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatching(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4 pb-10">
      <PageHeader
        title="Maringo Support"
        description="Meine Support-Tickets — Liste, Verlauf und AI-Analyse."
        icon={pageVisuals.maringo.icon}
        tone={pageVisuals.maringo.tone}
      />

      {!configured ? (
        <Card className="border-amber-200/80 bg-amber-50/50">
          <CardContent className="space-y-3 p-4 text-sm">
            <p>
              MARI-Login fehlt. Unter{" "}
              <Link
                href="/settings?tab=maringo"
                className="font-semibold text-orange-900 underline underline-offset-2"
              >
                Einstellungen → Maringo
              </Link>{" "}
              Benutzer, Passwort und Personalnummer hinterlegen.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-[70vh] gap-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)] lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        {/* List pane */}
        <section className="flex min-h-0 flex-col border-b border-border/60 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
            <p className="text-[13px] font-black tracking-tight">Tickets</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => void loadList()}
              disabled={listLoading}
              aria-label="Aktualisieren"
            >
              <RefreshCw
                className={cn("size-4", listLoading && "animate-spin")}
                strokeWidth={APP_ICON_STROKE}
              />
            </Button>
          </div>

          <div className="space-y-2 border-b border-border/50 px-3 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={selectAllWorkStatuses}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  statuses.length === WORK_STATUS_IDS.length && !overdueOnly
                    ? "border-orange-300 bg-orange-50 text-orange-950"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                )}
              >
                Meine
              </button>
              <button
                type="button"
                onClick={() => setOverdueOnly((v) => !v)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  overdueOnly
                    ? "border-rose-300 bg-rose-50 text-rose-950"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                )}
              >
                Überfällig
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[11px] font-semibold"
                    />
                  }
                >
                  Status ({statuses.length})
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Status (Mehrfachauswahl)</DropdownMenuLabel>
                    {WORK_STATUS_IDS.map((id) => (
                      <DropdownMenuCheckboxItem
                        key={id}
                        checked={statuses.includes(id)}
                        onCheckedChange={() => toggleStatus(id)}
                      >
                        {STATUS_LABELS[id] || `Status ${id}`}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={selectAllWorkStatuses}>
                    Alle Arbeitsstatus
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap gap-1">
              {statuses.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleStatus(id)}
                  title="Klicken zum Abwählen"
                >
                  <StatusChip status={id} className="cursor-pointer" />
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 p-2.5">
            {listLoading && tickets.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border/60 bg-background/80 px-3 py-6 text-sm text-muted-foreground">
                Lade Tickets…
              </li>
            ) : null}
            {!listLoading && tickets.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border/60 bg-background/80 px-3 py-6 text-center text-sm text-muted-foreground">
                Keine Tickets für die gewählten Status.
              </li>
            ) : null}
            {tickets.map((t) => {
              const active = t.issueId === selectedId;
              const due = formatDayMonth(t.dueDate);
              const overdue = isOverdue(t.dueDate);
              const contact = primaryContact(t.contactPerson);
              const companyLine = joinMeta([
                t.addressMatchcode,
                t.cardCode,
              ]);
              const classLine = joinMeta([
                t.issueTypeName,
                t.productName,
                t.priorityName && t.priorityName !== "Normal"
                  ? t.priorityName
                  : null,
                t.supportGroupName,
              ]);
              const peopleLine = joinMeta([
                t.handledByName || t.handledBy,
                contact,
              ]);
              const whenLine = joinMeta([
                formatDayMonth(t.requestDate)
                  ? `seit ${formatDayMonth(t.requestDate)}`
                  : null,
                formatDayMonth(t.changeAtDate)
                  ? `änd. ${formatDayMonth(t.changeAtDate)}`
                  : null,
                t.referenceText,
                t.stdFreigabe ? `Freigabe ${t.stdFreigabe}` : null,
                t.aiLabel,
              ]);
              return (
                <li key={t.issueId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.issueId)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-[background-color,border-color,box-shadow]",
                      active
                        ? "border-orange-300 bg-orange-50 shadow-[0_1px_0_rgba(251,146,60,0.25)] ring-1 ring-orange-200/80"
                        : "border-border/70 bg-background hover:border-orange-200/80 hover:bg-orange-50/40"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] font-bold text-foreground">
                            #{t.issueId}
                          </span>
                          <StatusChip
                            status={t.status}
                            statusName={t.statusName}
                          />
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight">
                          {t.briefDescription}
                        </p>
                      </div>
                      {due ? (
                        <span
                          className={cn(
                            "shrink-0 pt-0.5 text-right text-[11px] font-semibold leading-tight",
                            overdue ? "text-rose-700" : "text-muted-foreground"
                          )}
                          title={
                            formatDateShort(t.dueDate)
                              ? `Stichtag ${formatDateShort(t.dueDate)}`
                              : undefined
                          }
                        >
                          <span className="block text-[9px] font-bold uppercase tracking-wide opacity-70">
                            Stichtag
                          </span>
                          {due}
                        </span>
                      ) : null}
                    </div>
                    {companyLine ? (
                      <p className="truncate text-[12px] font-medium text-foreground/85">
                        {companyLine}
                      </p>
                    ) : null}
                    {classLine ? (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {classLine}
                      </p>
                    ) : null}
                    {peopleLine ? (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {peopleLine}
                      </p>
                    ) : null}
                    {whenLine ? (
                      <p className="truncate text-[10px] text-muted-foreground/90">
                        {whenLine}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
            {tickets.length} Ticket{tickets.length === 1 ? "" : "s"}
          </p>
        </section>

        {/* Detail pane */}
        <section className="flex min-h-0 flex-col">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Ticket auswählen
            </div>
          ) : detailLoading && !detail ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Lade Ticket…
            </div>
          ) : detail ? (
            <>
              <div className="space-y-3 border-b border-border/50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-bold text-muted-foreground">
                        #{detail.issueId}
                      </span>
                      <StatusChip
                        status={detail.status}
                        statusName={detail.statusName}
                      />
                    </div>
                    <h2 className="text-[17px] font-black tracking-tight">
                      {detail.briefDescription}
                    </h2>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          disabled={patching}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Status setzen</DropdownMenuLabel>
                        {[11, 1, 3, 6, 7, 13, 14, 2, 5].map((id) => (
                          <DropdownMenuItem
                            key={id}
                            disabled={patching || detail.status === id}
                            onClick={() => void patchTicket({ status: id })}
                          >
                            {STATUS_LABELS[id] || id}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Typ
                    </p>
                    <p className="font-semibold">
                      {detail.issueTypeName || "–"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Produkt
                    </p>
                    <p className="font-semibold">{detail.productName || "–"}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Matchcode
                    </p>
                    <p className="font-semibold">
                      {detail.addressMatchcode || "–"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <Flag className="size-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Prio
                      </p>
                      <p className="font-semibold">{detail.priorityName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <User className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Adresse
                      </p>
                      <p className="truncate font-semibold">
                        {detail.cardCode || "–"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Zuständig
                    </p>
                    <p className="font-semibold">
                      {detail.handledByName || detail.handledBy || "–"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Supportgruppe
                    </p>
                    <p className="font-semibold">
                      {detail.supportGroupName || "–"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Ansprechpartner
                    </p>
                    <p className="font-semibold">
                      {primaryContact(detail.contactPerson) || "–"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Datum
                    </p>
                    <p className="font-semibold">
                      {formatDateTimeShort(detail.requestDate) || "–"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Geändert am
                    </p>
                    <p className="font-semibold">
                      {formatDateTimeShort(detail.changeAtDate) || "–"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Referenz
                    </p>
                    <p className="font-semibold">{detail.referenceText || "–"}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Std. Freigabe
                    </p>
                    <p className="font-semibold">{detail.stdFreigabe || "–"}</p>
                  </div>
                  {detail.aiLabel ? (
                    <div className="rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px]">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        AI
                      </p>
                      <p className="font-semibold">{detail.aiLabel}</p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2 text-[12px] sm:col-span-2 xl:col-span-1">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    <Label htmlFor="dueDate" className="sr-only">
                      Stichtag
                    </Label>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Stichtag
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          id="dueDate"
                          type="date"
                          className="h-7 w-auto border-0 bg-transparent px-0 shadow-none"
                          value={dueDraft}
                          onChange={(e) => setDueDraft(e.target.value)}
                          disabled={patching}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={patching || !dueDraft}
                          onClick={() =>
                            void patchTicket({ dueDate: dueDraft || null })
                          }
                        >
                          Setzen
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-orange-600 text-white hover:bg-orange-700"
                    disabled={analyzing}
                    onClick={() => void runAnalyze()}
                  >
                    <Sparkles className="size-3.5" />
                    {analyzing ? "Analysiert…" : "AI analysieren"}
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {analysis ? (
                  <Card className="border-orange-200/70 bg-orange-50/40">
                    <CardContent className="space-y-3 p-4 text-[13px]">
                      <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-orange-900">
                        <Sparkles className="size-3.5" />
                        AI-Zusammenfassung
                      </p>
                      <p className="leading-relaxed">{analysis.summary}</p>
                      <div className="rounded-xl border border-orange-200/60 bg-white/70 px-3 py-2">
                        <p className="font-semibold">
                          Vollständigkeit: {analysis.completeness.score}/100
                        </p>
                        {analysis.completeness.missing.length > 0 ? (
                          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                            {analysis.completeness.missing.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">
                            Keine kritischen Lücken erkannt.
                          </p>
                        )}
                      </div>
                      {analysis.suggestedTasks.length > 0 ? (
                        <div>
                          <p className="font-semibold">Aufgaben</p>
                          <ul className="mt-1 space-y-1">
                            {analysis.suggestedTasks.map((t) => (
                              <li
                                key={t.title}
                                className="rounded-lg border border-border/50 bg-white/60 px-2.5 py-1.5"
                              >
                                <span className="font-medium">{t.title}</span>
                                {t.reason ? (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    — {t.reason}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {analysis.suggestions.length > 0 ? (
                        <div>
                          <p className="font-semibold">Vorschläge</p>
                          <ul className="mt-1 list-disc pl-4">
                            {analysis.suggestions.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {analysis.nextReplyDraft ? (
                        <div>
                          <p className="font-semibold">Antwort-Entwurf</p>
                          <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-border/50 bg-white/70 p-2.5 font-sans text-[12px]">
                            {analysis.nextReplyDraft}
                          </pre>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}

                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-black tracking-tight">
                    <MessageSquare className="size-3.5 text-muted-foreground" />
                    Verlauf
                  </h3>
                  {detail.timeline.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                      <Inbox className="mx-auto mb-2 size-5 opacity-50" />
                      Kein Verlauf vorhanden.
                      {detail.requestTextPlain ? (
                        <p className="mt-3 whitespace-pre-wrap text-left text-[13px] text-foreground">
                          {detail.requestTextPlain}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[0.7rem] before:w-px before:bg-border">
                      {detail.timeline.map((item) => (
                        <TimelineRow key={item.id} item={item} />
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
