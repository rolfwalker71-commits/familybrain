"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { toSwissDate } from "@/lib/utils/dates";
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
import type { CalendarEvent } from "@/lib/utils/ics";

type DeadlineRow = {
  id: number;
  title: string;
  description: string | null;
  deadline_date: string | null;
  deadline_type: string | null;
  status: string | null;
  confidence: number | null;
  document_title: string | null;
  document_local_id: number;
  correspondent_name: string | null;
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

export default function DeadlinesPage() {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<DeadlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusItems = {
    open: "Offen",
    completed: "Erledigt",
    all: "Alle",
  };

  async function load(selected = status) {
    setLoading(true);
    setError(null);
    try {
      const params = selected === "all" ? "" : `?status=${selected}`;
      const res = await fetch(`/api/deadlines${params}`);
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function markCompleted(id: number) {
    await fetch("/api/deadlines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "completed" }),
    });
    await load();
  }

  const calendarEvents = rows
    .map(deadlineToEvent)
    .filter((e): e is CalendarEvent => Boolean(e));

  return (
    <div className="min-w-0 space-y-4 pb-6 md:space-y-6">
      <PageHeader
        title="Fristenradar"
        description="Kündigungen, Garantieenden und Zahlungstermine"
        icon={pageVisuals.deadlines.icon}
        tone={pageVisuals.deadlines.tone}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
              <SelectTrigger className="w-40">
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

      <Card className="min-w-0 gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none md:overflow-hidden md:border md:border-border/60 md:bg-card md:shadow-[0_4px_16px_rgba(20,32,28,0.05)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Lade Fristen…
            </div>
          ) : error ? (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-8 text-sm shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              <p className="text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                Erneut laden
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-sm text-muted-foreground shadow-[0_4px_16px_rgba(20,32,28,0.05)] md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              Keine Fristen gefunden.
            </div>
          ) : (
            <DataList>
              {rows.map((row) => {
                const event = deadlineToEvent(row);
                const temporalStatus =
                  row.status === "completed"
                    ? "unknown"
                    : resolveTemporalStatus(row.deadline_date);

                return (
                  <DataListRow key={row.id}>
                    <DataListMain
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
                        </div>
                      }
                      meta={
                        <MetaLine>
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
                                : temporalStatusBadgeClass(temporalStatus)
                            }
                          >
                            {row.status === "completed"
                              ? "Erledigt"
                              : temporalStatusLabel(temporalStatus)}
                          </Badge>
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
                          <DocumentInfoButton
                            documentId={row.document_local_id}
                          />
                          {event ? (
                            <AddToCalendarButton
                              events={[event]}
                              filename={`familybrain-frist-${row.id}`}
                            />
                          ) : null}
                          {row.status === "open" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void markCompleted(row.id)}
                            >
                              Erledigt
                            </Button>
                          ) : (
                            <Badge>Erledigt</Badge>
                          )}
                        </>
                      }
                    />
                  </DataListRow>
                );
              })}
            </DataList>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
