"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type IcsCalendar = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  color: string;
  type: CalType;
  planningRelevant?: boolean;
  builtin?: boolean;
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

export function SettingsCalendarsPanel() {
  const [calendars, setCalendars] = useState<IcsCalendar[]>([]);
  const [types, setTypes] = useState<TypeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<CalType>("other");
  const [color, setColor] = useState("#64748b");

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editType, setEditType] = useState<CalType>("other");
  const [editColor, setEditColor] = useState("#64748b");
  const [editPlanningRelevant, setEditPlanningRelevant] = useState(true);
  const [newPlanningRelevant, setNewPlanningRelevant] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendars");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kalender laden fehlgeschlagen");
      setCalendars(data.calendars || []);
      setTypes(data.types || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function typeLabel(t: CalType): string {
    return types.find((x) => x.id === t)?.label || t;
  }

  function onTypeChange(next: CalType, mode: "new" | "edit") {
    const meta = types.find((x) => x.id === next);
    if (mode === "new") {
      setType(next);
      if (meta) setColor(meta.defaultColor);
    } else {
      setEditType(next);
      if (meta) setEditColor(meta.defaultColor);
    }
  }

  async function createCalendar() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url,
          type,
          color,
          enabled: true,
          planningRelevant: newPlanningRelevant,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen");
      setCalendars(data.calendars || []);
      setName("");
      setUrl("");
      setType("other");
      setColor("#64748b");
      setNewPlanningRelevant(true);
      setStatus("Kalender hinzugefügt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addAmbri() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addAmbri" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ambri hinzufügen fehlgeschlagen");
      }
      setCalendars(data.calendars || []);
      setStatus("Ambri-Kalender hinzugefügt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const existing = calendars.find((c) => c.id === editId);
      const res = await fetch("/api/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          name: editName,
          url: editUrl,
          type: existing?.builtin ? "hockey" : editType,
          color: editColor,
          enabled: existing?.enabled ?? true,
          planningRelevant: editPlanningRelevant,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setCalendars(data.calendars || []);
      setEditId(null);
      setStatus("Kalender gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Umschalten fehlgeschlagen");
      setCalendars(data.calendars || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function togglePlanningRelevant(id: string, planningRelevant: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, planningRelevant }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Umschalten fehlgeschlagen");
      setCalendars(data.calendars || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeCalendar(id: string) {
    const row = calendars.find((c) => c.id === id);
    if (!window.confirm(`Kalender «${row?.name || id}» wirklich löschen?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/calendars?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setCalendars(data.calendars || []);
      setStatus("Kalender gelöscht.");
      if (editId === id) setEditId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: IcsCalendar) {
    setEditId(c.id);
    setEditName(c.name);
    setEditUrl(c.url);
    setEditType(c.type);
    setEditColor(c.color);
    setEditPlanningRelevant(c.planningRelevant !== false);
    setStatus(null);
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={CalendarDays} tone="teal" size="sm" />
          Meine Kalender (ICS)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Zusätzliche öffentliche ICS-URLs (z.&nbsp;B. Schulen, Gemeinden) —
          unabhängig von Google. Google-Kalender oben anhaken, statt sie hier
          nochmals als ICS einzutragen.
        </p>

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

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade Kalender…</p>
        ) : (
          <ul className="space-y-3">
            {calendars.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-border/70 bg-card p-3"
                style={{ borderLeftWidth: 4, borderLeftColor: c.color }}
              >
                {editId === c.id ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cal-name-${c.id}`}>Name</Label>
                        <Input
                          id={`cal-name-${c.id}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Typ</Label>
                        <Select
                          value={c.builtin ? "hockey" : editType}
                          disabled={Boolean(c.builtin)}
                          onValueChange={(v) =>
                            onTypeChange(v as CalType, "edit")
                          }
                        >
                          <SelectTrigger>
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
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`cal-url-${c.id}`}>ICS-URL</Label>
                      <Input
                        id={`cal-url-${c.id}`}
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Farbe</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {PRESET_COLORS.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            className="size-7 rounded-full border border-black/10 ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            style={{
                              backgroundColor: hex,
                              boxShadow:
                                editColor === hex
                                  ? `0 0 0 2px ${hex}`
                                  : undefined,
                            }}
                            aria-label={hex}
                            onClick={() => setEditColor(hex)}
                          />
                        ))}
                        <Input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="h-8 w-12 cursor-pointer p-1"
                        />
                      </div>
                    </div>
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 rounded border"
                        checked={editPlanningRelevant}
                        disabled={busy}
                        onChange={(e) =>
                          setEditPlanningRelevant(e.target.checked)
                        }
                      />
                      <span>
                        Relevant für Terminplanung
                        <span className="mt-0.5 block text-[11px] text-muted-foreground/90">
                          Aus = nur Referenz (z.&nbsp;B. Partner-Dienstplan):
                          anzeigen, aber nicht als nächster Termin / Konflikt
                        </span>
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={busy || !editName.trim() || !editUrl.trim()}
                        onClick={() => void saveEdit()}
                      >
                        Speichern
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditId(null)}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{c.name}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {typeLabel(c.type)}
                        </Badge>
                        {c.builtin ? (
                          <Badge className="bg-rose-50 text-rose-800 hover:bg-rose-50 text-[10px]">
                            Built-in
                          </Badge>
                        ) : null}
                        {!c.enabled ? (
                          <Badge variant="outline" className="text-[10px]">
                            Ausgeblendet
                          </Badge>
                        ) : null}
                        {c.planningRelevant === false ? (
                          <Badge variant="outline" className="text-[10px]">
                            Nur Referenz
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {c.url}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="size-4 rounded border"
                          checked={c.enabled}
                          disabled={busy}
                          onChange={(e) =>
                            void toggleEnabled(c.id, e.target.checked)
                          }
                        />
                        Sichtbar
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="size-4 rounded border"
                          checked={c.planningRelevant !== false}
                          disabled={busy}
                          onChange={(e) =>
                            void togglePlanningRelevant(c.id, e.target.checked)
                          }
                        />
                        Planung
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => startEdit(c)}
                      >
                        <Pencil className="size-3.5" />
                        Bearbeiten
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void removeCalendar(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Löschen
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-xl border border-dashed border-border/80 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Plus className="size-4" />
            Kalender hinzufügen
          </p>
          {!calendars.some((c) => c.id === "builtin-ambri") ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Optional: öffentlicher Ambri-Spielplan (ICS) für Logos/Resultate
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void addAmbri()}
              >
                Ambri hinzufügen
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cal-new-name">Name</Label>
              <Input
                id="cal-new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Schule Altdorf"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select
                value={type}
                onValueChange={(v) => onTypeChange(v as CalType, "new")}
              >
                <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cal-new-url">ICS-URL</Label>
            <Input
              id="cal-new-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/basic.ics"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="size-7 rounded-full border border-black/10"
                  style={{
                    backgroundColor: hex,
                    boxShadow:
                      color === hex ? `0 0 0 2px ${hex}` : undefined,
                  }}
                  aria-label={hex}
                  onClick={() => setColor(hex)}
                />
              ))}
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-12 cursor-pointer p-1"
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border"
              checked={newPlanningRelevant}
              disabled={busy}
              onChange={(e) => setNewPlanningRelevant(e.target.checked)}
            />
            <span>
              Relevant für Terminplanung
              <span className="mt-0.5 block text-[11px] text-muted-foreground/90">
                Aus = nur Referenz (anzeigen, ohne Fokus/Konflikte)
              </span>
            </span>
          </label>
          <Button
            type="button"
            disabled={busy || !name.trim() || !url.trim()}
            onClick={() => void createCalendar()}
          >
            Hinzufügen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
