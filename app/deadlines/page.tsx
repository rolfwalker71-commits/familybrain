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
};

function deadlineToEvent(row: DeadlineRow): CalendarEvent | null {
  if (!row.deadline_date) return null;
  return {
    uid: `deadline-${row.id}@familybrain.local`,
    title: row.title,
    description: [
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

  async function load(selected = status) {
    setLoading(true);
    const params = selected === "all" ? "" : `?status=${selected}`;
    const res = await fetch(`/api/deadlines${params}`);
    const data = await res.json();
    setRows(data.deadlines || []);
    setLoading(false);
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
    <div className="min-w-0 space-y-6">
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
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Offen</SelectItem>
                <SelectItem value="completed">Erledigt</SelectItem>
                <SelectItem value="all">Alle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground">Lade Fristen…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              Keine Fristen gefunden.
            </div>
          ) : (
            <DataList>
              {rows.map((row) => {
                const event = deadlineToEvent(row);
                return (
                  <DataListRow key={row.id}>
                    <DataListMain
                      title={row.title}
                      subtitle={
                        row.description ? (
                          <SoftText className="mt-0 text-sm">
                            {row.description}
                          </SoftText>
                        ) : undefined
                      }
                      meta={
                        <MetaLine>
                          <span className="tabular-nums">
                            {toSwissDate(row.deadline_date)}
                          </span>
                          <Badge variant="secondary">
                            {row.deadline_type || "other"}
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
