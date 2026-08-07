"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconCircle } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

type CalType =
  | "hockey"
  | "school"
  | "waste"
  | "church"
  | "sports"
  | "family"
  | "birthday"
  | "work"
  | "holiday"
  | "other";

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

type TypeMeta = { id: CalType; label: string; defaultColor: string };

const PRESET_COLORS = [
  "#e11d48",
  "#2563eb",
  "#78836c",
  "#7c3aed",
  "#ea580c",
  "#db2777",
  "#ec4899",
  "#0f766e",
  "#8b5cf6",
  "#64748b",
  "#ca8a04",
];

const FALLBACK_TYPES: TypeMeta[] = [
  { id: "hockey", label: "Hockey", defaultColor: "#e11d48" },
  { id: "school", label: "Schule", defaultColor: "#2563eb" },
  { id: "waste", label: "Abfall", defaultColor: "#78836c" },
  { id: "church", label: "Kirche", defaultColor: "#7c3aed" },
  { id: "sports", label: "Sport", defaultColor: "#ea580c" },
  { id: "family", label: "Familie", defaultColor: "#db2777" },
  { id: "birthday", label: "Geburtstage", defaultColor: "#ec4899" },
  { id: "work", label: "Arbeit", defaultColor: "#0f766e" },
  { id: "holiday", label: "Ferien / Feiertage", defaultColor: "#8b5cf6" },
  { id: "other", label: "Sonstiges", defaultColor: "#64748b" },
];

type DraftRow = {
  on: boolean;
  type: CalType;
  color: string;
};

export function SettingsGoogleCalendarsPanel() {
  const [calendars, setCalendars] = useState<GoogleCal[]>([]);
  const [types, setTypes] = useState<TypeMeta[]>(FALLBACK_TYPES);
  const [connected, setConnected] = useState(false);
  const [hasCalendarScope, setHasCalendarScope] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gRes, icsRes] = await Promise.all([
        fetch("/api/google/calendars"),
        fetch("/api/calendars"),
      ]);
      const json = await gRes.json();
      const icsJson = await icsRes.json().catch(() => ({}));
      if (!gRes.ok && !json.calendars) {
        throw new Error(json.error || "Google-Kalender laden fehlgeschlagen");
      }
      if (Array.isArray(icsJson.types) && icsJson.types.length > 0) {
        setTypes(icsJson.types as TypeMeta[]);
      }
      setConnected(Boolean(json.connected));
      setHasCalendarScope(Boolean(json.hasCalendarScope));
      const list = (json.calendars || []) as GoogleCal[];
      setCalendars(list);
      const next: Record<string, DraftRow> = {};
      for (const c of list) {
        const type = (c.type || c.suggestedType || "other") as CalType;
        next[c.id] = {
          on: Boolean(c.selected && c.enabled),
          type,
          color: c.color || "#64748b",
        };
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

  function patchDraft(id: string, patch: Partial<DraftRow>) {
    setDraft((prev) => {
      const cur = prev[id] || {
        on: false,
        type: "other" as CalType,
        color: "#64748b",
      };
      const next = { ...cur, ...patch };
      if (patch.type && !patch.color) {
        const meta = types.find((t) => t.id === patch.type);
        if (meta) next.color = meta.defaultColor;
      }
      return { ...prev, [id]: next };
    });
    setStatus(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const selections = calendars
        .filter((c) => draft[c.id]?.on)
        .map((c) => {
          const d = draft[c.id]!;
          return {
            id: c.id,
            enabled: true,
            name: c.name,
            type: d.type,
            color: d.color,
          };
        });
      const res = await fetch("/api/google/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      const list = (json.calendars || []) as GoogleCal[];
      setCalendars(list);
      const next: Record<string, DraftRow> = {};
      for (const c of list) {
        const type = (c.type || c.suggestedType || "other") as CalType;
        next[c.id] = {
          on: Boolean(c.selected && c.enabled),
          type,
          color: c.color || "#64748b",
        };
      }
      setDraft(next);
      setStatus(
        `${selections.length} Google-Kalender für Buddy gespeichert.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const dirty = useMemo(() => {
    return calendars.some((c) => {
      const d = draft[c.id];
      if (!d) return false;
      const wasOn = Boolean(c.selected && c.enabled);
      const wasType = (c.type || c.suggestedType || "other") as string;
      const wasColor = c.color || "#64748b";
      return (
        d.on !== wasOn ||
        (d.on && (d.type !== wasType || d.color !== wasColor))
      );
    });
  }, [calendars, draft]);

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
          Kalender aus deinem Google-Konto anhaken und Typ/Farbe setzen.
          Typ «Hockey» (z. B. Ambri) aktiviert Logos und Resultate. Mit
          Schreibrecht schreibt Buddy Resultat + Torschützen nach dem Sync in
          den Google-Termin (Titel / Beschreibung).
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
              <ul className="space-y-3">
                {calendars.map((c) => {
                  const d = draft[c.id] || {
                    on: false,
                    type: "other" as CalType,
                    color: c.color,
                  };
                  return (
                    <li
                      key={c.id}
                      className="rounded-xl border border-border/70 bg-card p-3"
                      style={{
                        borderLeftWidth: 4,
                        borderLeftColor: d.color,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 rounded border"
                          checked={d.on}
                          disabled={saving}
                          onChange={(e) =>
                            patchDraft(c.id, { on: e.target.checked })
                          }
                          aria-label={`${c.name} in Buddy zeigen`}
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{c.name}</p>
                            {c.primary ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                Primär
                              </Badge>
                            ) : null}
                          </div>
                          {d.on ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Typ</Label>
                                <Select
                                  value={d.type}
                                  onValueChange={(v) =>
                                    patchDraft(c.id, {
                                      type: v as CalType,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {types.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Farbe</Label>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {PRESET_COLORS.map((hex) => (
                                    <button
                                      key={hex}
                                      type="button"
                                      className="size-6 rounded-full border border-black/10"
                                      style={{
                                        backgroundColor: hex,
                                        boxShadow:
                                          d.color === hex
                                            ? `0 0 0 2px ${hex}`
                                            : undefined,
                                      }}
                                      aria-label={hex}
                                      onClick={() =>
                                        patchDraft(c.id, { color: hex })
                                      }
                                    />
                                  ))}
                                  <Input
                                    type="color"
                                    value={d.color}
                                    onChange={(e) =>
                                      patchDraft(c.id, {
                                        color: e.target.value,
                                      })
                                    }
                                    className="h-7 w-10 cursor-pointer p-0.5"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {d.on && d.type === "hockey" ? (
                            <p className="text-[11px] text-muted-foreground">
                              Hockey: Spiele im Format «Heim – Gast» werden mit
                              Logos/Resultaten angezeigt (wie Ambri-ICS).
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
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
