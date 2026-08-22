"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";

type Traveler = {
  id: number;
  display_name: string;
  email: string | null;
  user_id: number | null;
};

type AppUser = {
  id: number;
  username: string;
  display_name: string;
  email: string;
  active: boolean;
};

export function TripTravelersCard({
  tripId,
  readOnly,
  onCountChange,
}: {
  tripId: number;
  readOnly?: boolean;
  onCountChange?: (count: number) => void;
}) {
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}/travelers`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      const list = (data.travelers || []) as Traveler[];
      setTravelers(list);
      onCountChange?.(list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tripId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (readOnly) return;
    void (async () => {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) return;
        const data = await res.json();
        setUsers(
          ((data.users || []) as AppUser[]).filter((u) => Boolean(u.active))
        );
      } catch {
        /* optional */
      }
    })();
  }, [readOnly]);

  async function addTraveler(payload: {
    displayName?: string;
    email?: string | null;
    userId?: number;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/travelers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setName("");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeTraveler(id: number) {
    if (!window.confirm("Reisende entfernen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/travelers/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const linkedUserIds = new Set(
    travelers.map((t) => t.user_id).filter((id): id is number => id != null)
  );

  return (
    <Card tone="green" className="rounded-md shadow-sm">
      <CardHeader tone="green" className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconCircle icon={Users} tone="green" size="sm" />
          Reisende
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-muted-foreground">
          Wer mitreist. Beim Anlegen der Abrechnung werden sie als Teilnehmer
          übernommen.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {travelers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Reisenden.</p>
        ) : (
          <ul className="space-y-1.5">
            {travelers.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-md border border-emerald-200/70 bg-white/70 px-2 py-1.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.display_name}</p>
                  {t.email ? (
                    <p className="truncate text-[0.6875rem] text-muted-foreground">
                      {t.email}
                    </p>
                  ) : null}
                </div>
                {!readOnly ? (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="shrink-0 text-destructive"
                    disabled={busy}
                    title="Entfernen"
                    onClick={() => void removeTraveler(t.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {!readOnly ? (
          <div className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-2.5">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Eliane"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">E-Mail (optional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !name.trim()}
              onClick={() =>
                void addTraveler({
                  displayName: name.trim(),
                  email: email.trim() || null,
                })
              }
            >
              <Plus className="mr-1 size-3.5" />
              Hinzufügen
            </Button>
            {users.length > 0 ? (
              <div className="space-y-1 border-t border-border/40 pt-2">
                <p className="text-[0.6875rem] font-medium text-muted-foreground">
                  App-Benutzer übernehmen
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {users.map((u) => {
                    const taken = linkedUserIds.has(u.id);
                    return (
                      <Button
                        key={u.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={busy || taken}
                        onClick={() => void addTraveler({ userId: u.id })}
                      >
                        {u.display_name || u.username}
                        {taken ? " ✓" : ""}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
