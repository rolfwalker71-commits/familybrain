"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare, Plane, StickyNote, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MailSuggestion } from "@/lib/mail/mail-action-schema";
import type { StoredMailAnalysis } from "@/lib/mail/mail-heuristic";
import { formatMailSuggestionDetail } from "@/lib/mail/format-suggestion";

type CalOption = { id: string; name: string; primary: boolean };
type TaskListOption = { id: string; title: string };
type TripOption = { id: number; title: string; start_date: string | null };

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
  const [notesDraft, setNotesDraft] = useState<
    Record<string, Record<number, string>>
  >({});
  const [titleDraft, setTitleDraft] = useState<
    Record<string, Record<number, string>>
  >({});
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [tripPick, setTripPick] = useState<
    Record<string, Record<number, string>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [pendingWarnings, setPendingWarnings] = useState<{
    messageId: string;
    warnings: Array<{ code: string; message: string }>;
  } | null>(null);

  const loadTargets = useCallback(async () => {
    setTargetsError(null);
    try {
      const [calRes, taskRes, tripRes] = await Promise.all([
        fetch("/api/google/calendars"),
        fetch("/api/google/tasks"),
        fetch("/api/trips?sortDir=desc"),
      ]);
      const calJson = await calRes.json();
      const taskJson = await taskRes.json();
      const tripJson = await tripRes.json().catch(() => ({}));
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

      const tripList = (tripJson.trips || []) as TripOption[];
      setTrips(
        tripList
          .filter((t) => t.id && t.title)
          .slice(0, 40)
          .map((t) => ({
            id: t.id,
            title: t.title,
            start_date: t.start_date ?? null,
          }))
      );
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
      const drafts: Record<string, Record<number, string>> = {};
      const titles: Record<string, Record<number, string>> = {};
      const tripsSel: Record<string, Record<number, string>> = {};
      for (const row of list) {
        const map: Record<number, boolean> = {};
        const noteMap: Record<number, string> = {};
        const titleMap: Record<number, string> = {};
        const tripMap: Record<number, string> = {};
        (row.analysis?.suggestions || []).forEach((s, i) => {
          map[i] = true;
          noteMap[i] = s.notes?.trim() || "";
          titleMap[i] = s.title;
          if (s.kind === "trip") tripMap[i] = "new";
        });
        next[row.messageId] = map;
        drafts[row.messageId] = noteMap;
        titles[row.messageId] = titleMap;
        tripsSel[row.messageId] = tripMap;
      }
      setSelected(next);
      setNotesDraft(drafts);
      setTitleDraft(titles);
      setTripPick(tripsSel);
      const replies: Record<string, string> = {};
      for (const row of list) {
        if (row.analysis?.replyDraft?.body) {
          replies[row.messageId] = row.analysis.replyDraft.body;
        }
      }
      setReplyDrafts(replies);
      setPendingWarnings(null);
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
          suggestions[i]?.kind === "task" ||
          suggestions[i]?.kind === "finance"
        ) {
          if (selected[row.messageId]?.[i]) {
            return true;
          }
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

  async function apply(
    row: StoredMailAnalysis,
    opts?: { confirmDuplicates?: boolean }
  ) {
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
      const actions = picks.map(({ s, i }) => {
        const tripSel = tripPick[row.messageId]?.[i] || "new";
        const tripId =
          s.kind === "trip" && tripSel !== "new" ? Number(tripSel) : null;
        return {
          kind: s.kind,
          title:
            (titleDraft[row.messageId]?.[i] ?? s.title).trim() || s.title,
          notes:
            notesDraft[row.messageId]?.[i] ??
            s.notes ??
            null,
          startDate: s.startDate ?? null,
          startTime: s.startTime ?? null,
          endDate: s.endDate ?? null,
          endTime: s.endTime ?? null,
          allDay: s.allDay ?? !s.startTime,
          location: s.location ?? null,
          dueDate: s.dueDate ?? null,
          reference: s.reference ?? null,
          calendarId:
            s.kind === "event"
              ? s.calendarId || calendarId || null
              : null,
          tasklistId:
            s.kind === "task" || s.kind === "finance"
              ? tasklistId || null
              : null,
          patchEventId: s.patchEventId ?? null,
          tripType: s.tripType ?? null,
          provider: s.provider ?? null,
          bookingReference: s.bookingReference ?? null,
          tripId: Number.isFinite(tripId) && tripId! > 0 ? tripId : null,
          newTripTitle:
            s.kind === "trip" && (!tripId || tripSel === "new")
              ? titleDraft[row.messageId]?.[i] ?? s.title
              : null,
          amount: s.amount ?? null,
          currency: s.currency ?? null,
          vendor: s.vendor ?? null,
          documentId: s.documentId ?? null,
        };
      });
      const res = await fetch(
        `/api/mail/${encodeURIComponent(row.messageId)}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions,
            confirmDuplicates: opts?.confirmDuplicates === true,
            memberId: row.analysis?.suggestedMember?.memberId ?? null,
            memberDisplayName:
              row.analysis?.suggestedMember?.displayName ?? null,
          }),
        }
      );
      const data = await res.json();
      if (res.status === 422 && data.needsConfirm && Array.isArray(data.warnings)) {
        setPendingWarnings({
          messageId: row.messageId,
          warnings: data.warnings,
        });
        setError(null);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
      if (!data.okCount) {
        throw new Error("Nichts angelegt");
      }
      setPendingWarnings(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function saveReplyDraft(row: StoredMailAnalysis) {
    const body = (replyDrafts[row.messageId] || "").trim();
    if (!body) {
      setError("Antwort-Entwurf ist leer.");
      return;
    }
    setBusyId(row.messageId);
    setError(null);
    try {
      const res = await fetch(
        `/api/mail/${encodeURIComponent(row.messageId)}/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            subject: row.analysis?.replyDraft?.subject ?? null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Entwurf fehlgeschlagen");
      setError(null);
      // reuse error slot as soft success via targets? keep quiet — brief status
      setTargetsError((prev) => prev || "Gmail-Entwurf gespeichert.");
      window.setTimeout(() => {
        setTargetsError((prev) =>
          prev === "Gmail-Entwurf gespeichert." ? null : prev
        );
      }, 2500);
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
                      {row.analysis?.suggestedMember ? (
                        <p className="mt-0.5 text-[11px] font-medium text-violet-800/90">
                          Person: {row.analysis.suggestedMember.displayName}
                        </p>
                      ) : null}
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
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            {s.kind === "event" ? (
                              <CalendarDays
                                className="mt-1.5 size-3.5 text-emerald-700"
                                aria-hidden
                              />
                            ) : s.kind === "note" ? (
                              <StickyNote
                                className="mt-1.5 size-3.5 text-amber-700"
                                aria-hidden
                              />
                            ) : s.kind === "trip" ? (
                              <Plane
                                className="mt-1.5 size-3.5 text-violet-700"
                                aria-hidden
                              />
                            ) : s.kind === "finance" ? (
                              <Wallet
                                className="mt-1.5 size-3.5 text-rose-700"
                                aria-hidden
                              />
                            ) : (
                              <CheckSquare
                                className="mt-1.5 size-3.5 text-sky-700"
                                aria-hidden
                              />
                            )}
                            <label className="min-w-0 flex-1 space-y-0.5">
                              <span className="sr-only">Titel</span>
                              <input
                                type="text"
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm font-medium"
                                value={
                                  titleDraft[row.messageId]?.[i] ?? s.title
                                }
                                disabled={busy}
                                onChange={(e) =>
                                  setTitleDraft((prev) => ({
                                    ...prev,
                                    [row.messageId]: {
                                      ...prev[row.messageId],
                                      [i]: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Titel"
                              />
                            </label>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {formatMailSuggestionDetail(s)}
                            {s.patchEventId ? " · aktualisiert bestehenden Termin" : ""}
                          </p>
                          <label className="block space-y-0.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Beschreibung
                            </span>
                            <textarea
                              className="min-h-[2.75rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs leading-snug"
                              rows={2}
                              value={
                                notesDraft[row.messageId]?.[i] ??
                                s.notes ??
                                ""
                              }
                              disabled={busy}
                              onChange={(e) =>
                                setNotesDraft((prev) => ({
                                  ...prev,
                                  [row.messageId]: {
                                    ...prev[row.messageId],
                                    [i]: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Beschreibung für Kalender / Aufgabe / Reise / Notiz"
                            />
                          </label>
                          {s.kind === "trip" ? (
                            <label className="block space-y-0.5">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Reise zuordnen
                              </span>
                              <select
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                value={tripPick[row.messageId]?.[i] || "new"}
                                disabled={busy}
                                onChange={(e) =>
                                  setTripPick((prev) => ({
                                    ...prev,
                                    [row.messageId]: {
                                      ...prev[row.messageId],
                                      [i]: e.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="new">Neue Reise anlegen</option>
                                {trips.map((t) => (
                                  <option key={t.id} value={String(t.id)}>
                                    {t.title}
                                    {t.start_date ? ` · ${t.start_date}` : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {s.kind === "finance" && s.documentId ? (
                            <p className="text-[11px] text-rose-800/90">
                              Verknüpft mit offener Rechnung · Doc #
                              {s.documentId}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {row.analysis?.replyDraft?.body ||
                  replyDrafts[row.messageId] ? (
                    <div className="space-y-1.5 rounded-lg border border-sky-200/70 bg-sky-50/40 px-2.5 py-2 dark:border-sky-400/30 dark:bg-sky-500/10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-900/80">
                        Antwort-Entwurf
                      </p>
                      <textarea
                        className="min-h-[3.5rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs leading-snug"
                        rows={3}
                        value={replyDrafts[row.messageId] || ""}
                        disabled={busy}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({
                            ...prev,
                            [row.messageId]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void saveReplyDraft(row)}
                      >
                        Als Gmail-Entwurf
                      </Button>
                    </div>
                  ) : null}
                  {pendingWarnings?.messageId === row.messageId ? (
                    <div
                      className="space-y-2 rounded-lg border border-amber-300/80 bg-amber-50/80 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-400/35 dark:bg-amber-500/12 dark:text-amber-100"
                      role="alert"
                    >
                      <p className="font-semibold">Hinweise vor Übernehmen</p>
                      <ul className="list-disc space-y-1 pl-4">
                        {pendingWarnings.warnings.map((w, wi) => (
                          <li key={`${w.code}-${wi}`}>{w.message}</li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void apply(row, { confirmDuplicates: true })
                          }
                        >
                          Trotzdem übernehmen
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setPendingWarnings(null)}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : null}
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
