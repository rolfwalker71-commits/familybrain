"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

type GoogleCal = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  primary: boolean;
  accessRole: string | null;
  suggestedType: string;
  selected: boolean;
  enabled: boolean;
  type: string;
};

export function SettingsGoogleCalendarsPanel() {
  const [calendars, setCalendars] = useState<GoogleCal[]>([]);
  const [connected, setConnected] = useState(false);
  const [hasCalendarScope, setHasCalendarScope] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** Local draft of which calendars are selected+enabled */
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/google/calendars");
      const json = await res.json();
      if (!res.ok && !json.calendars) {
        throw new Error(json.error || "Google-Kalender laden fehlgeschlagen");
      }
      setConnected(Boolean(json.connected));
      setHasCalendarScope(Boolean(json.hasCalendarScope));
      const list = (json.calendars || []) as GoogleCal[];
      setCalendars(list);
      const next: Record<string, boolean> = {};
      for (const c of list) {
        next[c.id] = Boolean(c.selected && c.enabled);
      }
      setDraft(next);
      if (json.error) setError(String(json.error));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string, on: boolean) {
    setDraft((prev) => ({ ...prev, [id]: on }));
    setStatus(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const selections = calendars
        .filter((c) => draft[c.id])
        .map((c) => ({
          id: c.id,
          enabled: true,
          name: c.name,
          type: c.type || c.suggestedType,
          color: c.color,
        }));
      const res = await fetch("/api/google/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      const list = (json.calendars || []) as GoogleCal[];
      setCalendars(list);
      const next: Record<string, boolean> = {};
      for (const c of list) {
        next[c.id] = Boolean(c.selected && c.enabled);
      }
      setDraft(next);
      setStatus(
        `${selections.length} Google-Kalender für Buddy ausgewählt.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    calendars.some((c) => Boolean(draft[c.id]) !== Boolean(c.selected && c.enabled));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={CalendarRange} tone="teal" size="sm" />
          Google-Kalender
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Kalender aus deinem verbundenen Google-Konto auswählen — ohne
          ICS-URL. Zusätzliche öffentliche ICS-Feeds kannst du darunter weiter
          eintragen.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : !connected ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              Noch kein Google-Konto verbunden.
            </p>
            <a
              href="/api/google/oauth/start"
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              <Link2 className="size-3.5" />
              Google verbinden
            </a>
          </div>
        ) : !hasCalendarScope ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              Verbindung ohne Kalender-Recht — bitte neu verbinden.
            </p>
            <a
              href="/api/google/oauth/start"
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              <Link2 className="size-3.5" />
              Neu verbinden (Kalender)
            </a>
          </div>
        ) : (
          <>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="text-sm text-emerald-700" role="status">
                {status}
              </p>
            ) : null}

            {calendars.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Kalender von Google erhalten.
              </p>
            ) : (
              <ul className="space-y-2">
                {calendars.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
                    style={{ borderLeftWidth: 4, borderLeftColor: c.color }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 rounded border"
                      checked={Boolean(draft[c.id])}
                      disabled={saving}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                      aria-label={`${c.name} in Buddy zeigen`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{c.name}</p>
                        {c.primary ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Primär
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="text-[10px]">
                          {c.type || c.suggestedType}
                        </Badge>
                      </div>
                      {c.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {c.description}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void save()}
              >
                Auswahl speichern
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void load()}
              >
                Neu laden
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
