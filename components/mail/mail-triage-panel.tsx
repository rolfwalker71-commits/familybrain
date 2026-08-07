"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MailSuggestion } from "@/lib/mail/mail-action-schema";
import type { StoredMailAnalysis } from "@/lib/mail/mail-heuristic";
import { formatMailSuggestionDetail } from "@/lib/mail/format-suggestion";

type CalOption = { id: string; name: string; primary: boolean };
type TaskListOption = { id: string; title: string };

export function MailTriagePanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [pending, setPending] = useState<StoredMailAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<CalOption[]>([]);
  const [tasklists, setTasklists] = useState<TaskListOption[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [tasklistId, setTasklistId] = useState("");
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<
    Record<string, Record<number, boolean>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTargets = useCallback(async () => {
    setTargetsError(null);
    try {
      const [calRes, taskRes] = await Promise.all([
        fetch("/api/google/calendars"),
        fetch("/api/google/tasks"),
      ]);
      const calJson = await calRes.json();
      const taskJson = await taskRes.json();
      if (!calRes.ok && calJson.error) {
        setTargetsError(String(calJson.error));
      }
      const cals = (calJson.calendars || []) as Array<{
        id: string;
        name: string;
        primary: boolean;
        accessRole?: string | null;
      }>;
      const writable = cals.filter((c) => {
        const role = (c.accessRole || "").toLowerCase();
        return (
          !role ||
          role === "owner" ||
          role === "writer" ||
          role === "primary"
        );
      });
      // Prefer writable; if filter empties everything, fall back to all listed
      const pool = (writable.length > 0 ? writable : cals).filter((c) => c.id);
      const options = pool.map((c) => ({
        id: c.id,
        name: c.name,
        primary: c.primary,
      }));
      setCalendars(options);
      const primary = options.find((c) => c.primary) || options[0];
      if (primary) setCalendarId((p) => p || primary.id);
      else if (options.length === 0) {
        setTargetsError(
          (prev) =>
            prev ||
            "Keine schreibbaren Google-Kalender gefunden — unter Konto Kalender-Rechte prüfen."
        );
      }

      const lists = (taskJson.lists || []) as TaskListOption[];
      setTasklists(lists);
      if (lists[0]) setTasklistId((p) => p || lists[0]!.id);
    } catch (err) {
      setTargetsError(
        err instanceof Error ? err.message : "Kalender/Tasks laden fehlgeschlagen"
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadTargets();
      const res = await fetch("/api/mail/triage");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      const list = (data.pending || []) as StoredMailAnalysis[];
      setPending(list);
      const next: Record<string, Record<number, boolean>> = {};
      for (const row of list) {
        const map: Record<number, boolean> = {};
        (row.analysis?.suggestions || []).forEach((_, i) => {
          map[i] = true;
        });
        next[row.messageId] = map;
      }
      setSelected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadTargets]);

  useEffect(() => {
    void load();
  }, [load]);

  const anyEventSelected = useMemo(() => {
    for (const row of pending) {
      const suggestions = row.analysis?.suggestions || [];
      for (let i = 0; i < suggestions.length; i += 1) {
        if (
          suggestions[i]?.kind === "event" &&
          selected[row.messageId]?.[i]
        ) {
          return true;
        }
      }
    }
    return false;
  }, [pending, selected]);

  const anyTaskSelected = useMemo(() => {
    for (const row of pending) {
      const suggestions = row.analysis?.suggestions || [];
      for (let i = 0; i < suggestions.length; i += 1) {
        if (
          suggestions[i]?.kind === "task" &&
          selected[row.messageId]?.[i]
        ) {
          return true;
        }
      }
    }
    return false;
  }, [pending, selected]);

  async function dismiss(messageId: string) {
    setBusyId(messageId);
    try {
      const res = await fetch("/api/mail/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, action: "dismiss" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerfen fehlgeschlagen");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function apply(row: StoredMailAnalysis) {
    const suggestions = row.analysis?.suggestions || [];
    const picks = suggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => selected[row.messageId]?.[i]);
    if (picks.length === 0) return;
    if (picks.some(({ s }) => s.kind === "event") && !calendarId.trim()) {
      setError("Bitte einen Kalender für den Termin wählen.");
      return;
    }
    setBusyId(row.messageId);
    setError(null);
    try {
      const actions = picks.map(({ s }) => ({
        kind: s.kind,
        title: s.title,
        notes: s.notes ?? null,
        startDate: s.startDate ?? null,
        startTime: s.startTime ?? null,
        endDate: s.endDate ?? null,
        endTime: s.endTime ?? null,
        allDay: s.allDay ?? !s.startTime,
        location: s.location ?? null,
        dueDate: s.dueDate ?? null,
        reference: s.reference ?? null,
        calendarId: s.kind === "event" ? calendarId || null : null,
        tasklistId: s.kind === "task" ? tasklistId || null : null,
      }));
      const res = await fetch(
        `/api/mail/${encodeURIComponent(row.messageId)}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
      if (!data.okCount) {
        throw new Error("Nichts angelegt");
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Lade Vorschläge…</p>;
  }

  if (pending.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Keine offenen Mail-Vorschläge. Beim Laden der Post werden neue Mails
          automatisch geprüft.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {targetsError ? (
        <p className="text-sm text-amber-800" role="status">
          {targetsError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-xs">
        {anyEventSelected ? (
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="font-medium text-foreground">
              Kalender für Termine
            </span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
            >
              {calendars.length === 0 ? (
                <option value="">— Keine Kalender —</option>
              ) : (
                calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.primary ? " (primär)" : ""}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}
        {anyTaskSelected ? (
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="font-medium text-foreground">Taskliste</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={tasklistId}
              onChange={(e) => setTasklistId(e.target.value)}
            >
              {tasklists.length === 0 ? (
                <option value="">— Standard / Tasks verbinden —</option>
              ) : (
                tasklists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}
        {!anyEventSelected && !anyTaskSelected ? (
          <p className="text-muted-foreground">
            Wähle Termin oder Aufgabe, um Zielkalender bzw. Taskliste zu sehen.
          </p>
        ) : null}
      </div>

      <ul className="space-y-3">
        {pending.map((row) => {
          const suggestions = row.analysis?.suggestions || [];
          const busy = busyId === row.messageId;
          return (
            <li key={row.messageId}>
              <Card className="border-border/70">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {row.subject || "(kein Betreff)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.fromName || row.fromEmail}
                        {row.summary ? ` · ${row.summary}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void dismiss(row.messageId)}
                      aria-label="Verwerfen"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  <ul className="space-y-1.5">
                    {suggestions.map((s, i) => (
                      <li
                        key={`${row.messageId}-${i}`}
                        className="flex items-start gap-2 rounded-lg border border-border/50 px-2 py-1.5"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={Boolean(selected[row.messageId]?.[i])}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [row.messageId]: {
                                ...prev[row.messageId],
                                [i]: e.target.checked,
                              },
                            }))
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            {s.kind === "event" ? (
                              <CalendarDays
                                className="size-3.5 text-emerald-700"
                                aria-hidden
                              />
                            ) : s.kind === "note" ? (
                              <StickyNote
                                className="size-3.5 text-amber-700"
                                aria-hidden
                              />
                            ) : (
                              <CheckSquare
                                className="size-3.5 text-sky-700"
                                aria-hidden
                              />
                            )}
                            {s.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatMailSuggestionDetail(s)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void apply(row)}
                    >
                      {busy ? "…" : "Übernehmen"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void dismiss(row.messageId)}
                    >
                      Verwerfen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
