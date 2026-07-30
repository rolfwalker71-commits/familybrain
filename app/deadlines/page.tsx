"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataList,
  DataListRow,
  DataListMain,
  MetaLine,
  SoftText,
} from "@/components/layout/data-list";
import { TimeBucketSection } from "@/components/layout/time-bucket-section";
import { toSwissDate } from "@/lib/utils/dates";
import { groupByTimeBucket } from "@/lib/utils/time-buckets";
import {
  ListSortControl,
  useListSortDir,
} from "@/components/layout/list-sort-control";
import {
  deadlineTypeLabel,
  resolveTemporalStatus,
  temporalStatusBadgeClass,
  temporalStatusLabel,
} from "@/lib/utils/temporal-status";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import {
  DocumentInfoButton,
  DocumentTitleLink,
} from "@/components/documents/document-link";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { RecipientAvatars } from "@/components/family/recipient-avatars";
import type { RecipientAvatarInfo } from "@/components/family/recipient-avatars";
import type { CalendarEvent } from "@/lib/utils/ics";

type DeadlineRow = {
  id: number;
  title: string;
  description: string | null;
  deadline_date: string | null;
  deadline_type: string | null;
  status: string | null;
  snoozed_until?: string | null;
  manual_override?: number | null;
  confidence: number | null;
  document_title: string | null;
  document_local_id: number;
  correspondent_name: string | null;
  ai_icon_url?: string | null;
  category?: string | null;
  recipients?: RecipientAvatarInfo;
};

function deadlineToEvent(row: DeadlineRow): CalendarEvent | null {
  if (!row.deadline_date) return null;
  return {
    uid: `deadline-${row.id}@familybrain.local`,
    title: row.title,
    description: [
      row.correspondent_name ? `Korrespondent: ${row.correspondent_name}` : null,
      row.deadline_type ? `Typ: ${row.deadline_type}` : null,
      row.description,
      row.document_title ? `Dokument: ${row.document_title}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    startDate: row.deadline_date,
    endDate: row.deadline_date,
    url:
      typeof window !== "undefined"
        ? `${window.location.origin}/documents/${row.document_local_id}`
        : undefined,
  };
}

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function deadlineBadgeLabel(row: DeadlineRow): string {
  if (row.status === "completed") return "Erledigt";
  const today = todayIso();
  if (
    row.snoozed_until &&
    row.snoozed_until >= today
  ) {
    return `Zurückgestellt bis ${toSwissDate(row.snoozed_until)}`;
  }
  const temporal = resolveTemporalStatus(row.deadline_date);
  if (temporal === "expired") return "Verfallen";
  return temporalStatusLabel(temporal);
}

export default function DeadlinesPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lade Fristen…</p>
      }
    >
      <DeadlinesPageInner />
    </Suspense>
  );
}

function DeadlinesPageInner() {
  const searchParams = useSearchParams();
  const initial =
    searchParams.get("status") || "open";
  const [status, setStatus] = useState(initial);
  const [sortDir, setSortDir] = useListSortDir("deadlines", "asc");
  const [rows, setRows] = useState<DeadlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const statusItems = {
    open: "Offen",
    overdue: "Verfallen",
    snoozed: "Zurückgestellt",
    completed: "Erledigt",
    all: "Alle",
  };

  async function load(selected = status, dir = sortDir) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selected !== "all") params.set("status", selected);
      params.set("sortDir", dir);
      const res = await fetch(`/api/deadlines?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fristen konnten nicht geladen werden");
      }
      setRows(data.deadlines || []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const fromUrl = searchParams.get("status");
    if (fromUrl && fromUrl !== status) setStatus(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sortDir]);

  async function patchDeadline(id: number, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch("/api/deadlines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const calendarEvents = rows
    .map(deadlineToEvent)
    .filter((e): e is CalendarEvent => Boolean(e));

  const today = todayIso();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.title,
        row.description,
        row.correspondent_name,
        row.document_title,
        row.deadline_type,
        deadlineTypeLabel(row.deadline_type),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);
  const searching = search.trim().length > 0;
  const buckets = useMemo(
    () =>
      groupByTimeBucket(
        filtered,
        (r) => r.deadline_date,
        today,
        "deadlines"
      ).map((b) => (searching ? { ...b, defaultOpen: true } : b)),
    [filtered, today, searching]
  );

  function renderDeadlineRow(row: DeadlineRow) {
    const event = deadlineToEvent(row);
    const temporalStatus =
      row.status === "completed"
        ? "unknown"
        : resolveTemporalStatus(row.deadline_date);
    const isEditing = editingId === row.id;

    return (
      <DataListRow key={row.id}>
        <DataListMain
          leading={
            <DocumentAiIcon
              aiIconUrl={row.ai_icon_url}
              category={row.category}
              size="md"
            />
          }
          title={row.title}
          subtitle={
            <div className="space-y-1">
              {row.correspondent_name ? (
                <SoftText className="mt-0 font-medium text-foreground/80">
                  {row.correspondent_name}
                </SoftText>
              ) : null}
              {row.description ? (
                <SoftText className="mt-0 text-sm">
                  {row.description}
                </SoftText>
              ) : null}
              {isEditing ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    className="h-8 max-w-xs text-sm"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Titel"
                  />
                  <Input
                    type="date"
                    className="h-8 w-40 text-sm"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={busyId === row.id || !editTitle.trim()}
                    onClick={() =>
                      void patchDeadline(row.id, {
                        title: editTitle.trim(),
                        deadlineDate: editDate || null,
                      })
                    }
                  >
                    Speichern
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Abbrechen
                  </Button>
                </div>
              ) : null}
            </div>
          }
          meta={
            <MetaLine>
              <RecipientAvatars recipients={row.recipients} />
              <span className="font-semibold tabular-nums">
                {toSwissDate(row.deadline_date)}
              </span>
              <Badge variant="secondary">
                {deadlineTypeLabel(row.deadline_type)}
              </Badge>
              <Badge
                variant="secondary"
                className={
                  row.status === "completed"
                    ? "border-transparent bg-muted text-muted-foreground hover:bg-muted"
                    : temporalStatus === "expired"
                      ? "border-transparent bg-red-100 text-red-700"
                      : temporalStatusBadgeClass(temporalStatus)
                }
              >
                {deadlineBadgeLabel(row)}
              </Badge>
              {row.manual_override ? (
                <Badge variant="outline">Manuell</Badge>
              ) : null}
              <span className="tabular-nums">
                {row.confidence != null
                  ? `${Math.round(row.confidence * 100)}%`
                  : "–"}
              </span>
              <DocumentTitleLink
                documentId={row.document_local_id}
                title={row.document_title}
              />
            </MetaLine>
          }
          actions={
            <>
              <DocumentInfoButton documentId={row.document_local_id} />
              {event ? (
                <AddToCalendarButton
                  events={[event]}
                  filename={`familybrain-frist-${row.id}`}
                />
              ) : null}
              {row.status === "open" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() => {
                      setEditingId(row.id);
                      setEditTitle(row.title);
                      setEditDate(row.deadline_date || "");
                    }}
                  >
                    Korrigieren
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() =>
                      void patchDeadline(row.id, { snoozeDays: 7 })
                    }
                  >
                    +7 Tage
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() =>
                      void patchDeadline(row.id, { snoozeDays: 14 })
                    }
                  >
                    +14
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() =>
                      void patchDeadline(row.id, { snoozeDays: 30 })
                    }
                  >
                    +30
                  </Button>
                  {row.snoozed_until ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === row.id}
                      onClick={() =>
                        void patchDeadline(row.id, {
                          snoozedUntil: null,
                        })
                      }
                    >
                      Snooze aufheben
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() =>
                      void patchDeadline(row.id, {
                        status: "completed",
                      })
                    }
                  >
                    Erledigt
                  </Button>
                </>
              ) : (
                <Badge>Erledigt</Badge>
              )}
            </>
          }
        />
      </DataListRow>
    );
  }

  return (
    <div className="min-w-0 space-y-4 pb-6 md:space-y-6">
      <PageHeader
        title="Fristenradar"
        description="Kündigungen, Garantieenden und Zahlungstermine"
        icon={pageVisuals.deadlines.icon}
        tone={pageVisuals.deadlines.tone}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ListSortControl
              storageKey="deadlines"
              label={status === "snoozed" ? "Zurückgestellt" : "Fälligkeit"}
              defaultDir="asc"
              dir={sortDir}
              onDirChange={setSortDir}
            />
            {calendarEvents.length > 0 ? (
              <AddToCalendarButton
                events={calendarEvents}
                filename="familybrain-fristen"
                label="Sichtbare in Kalender"
              />
            ) : null}
            <Select
              value={status}
              onValueChange={(value) => {
                if (value != null) setStatus(value);
              }}
              items={statusItems}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Titel, Korrespondent, Dokument …"
          className="pl-9"
          aria-label="Fristen durchsuchen"
        />
      </div>

      <Card className="min-w-0 gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none md:overflow-hidden md:border md:border-border/60 md:bg-card md:shadow-[0_4px_16px_rgba(20,32,28,0.05)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="rounded-xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Lade Fristen…
            </div>
          ) : error ? (
            <div className="space-y-3 rounded-xl border border-border/60 bg-card p-8 text-sm shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              <p className="text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                Erneut laden
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Keine Fristen gefunden.
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Keine Treffer für «{search.trim()}».
            </div>
          ) : (
            <div className="md:divide-y-0">
              {buckets.map((bucket) => (
                <TimeBucketSection
                  key={`${bucket.id}-${searching ? "s" : "n"}`}
                  title={bucket.title}
                  accent={bucket.accent}
                  defaultOpen={bucket.defaultOpen}
                  countLabel={`${bucket.rows.length} ${
                    bucket.rows.length === 1 ? "Frist" : "Fristen"
                  }`}
                >
                  <DataList>
                    {bucket.rows.map((row) => renderDeadlineRow(row))}
                  </DataList>
                </TimeBucketSection>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
