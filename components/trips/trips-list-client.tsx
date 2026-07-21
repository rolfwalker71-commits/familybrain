"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { toSwissDate } from "@/lib/utils/dates";
import { TRIP_STATUSES } from "@/lib/trips/constants";

type Trip = {
  id: number;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  summary: string | null;
  cover_url: string | null;
  event_count?: number;
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  active: "Unterwegs",
  done: "Abgeschlossen",
  cancelled: "Abgesagt",
};

export function TripsListClient() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState<(typeof TRIP_STATUSES)[number]>("planned");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/trips");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setTrips(data.trips || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTrip() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          destination: destination.trim() || null,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen");
      setTitle("");
      setDestination("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function removeTrip(id: number, tripTitle: string) {
    if (!window.confirm(`Reise «${tripTitle}» wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="TravelBrain"
        description="Reisen planen, Ereignisse sammeln und Timeline verwalten"
        icon={pageVisuals.trips.icon}
        tone={pageVisuals.trips.tone}
      />

      <Card className="border-border/80 shadow-sm">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tripTitle">Neue Reise</Label>
            <Input
              id="tripTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Kreuzfahrt Karibik 2026"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tripDest">Ziel (optional)</Label>
            <Input
              id="tripDest"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Ort / Region"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                if (v == null) return;
                setStatus(v as (typeof TRIP_STATUSES)[number]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIP_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-4">
            <Button
              onClick={() => void createTrip()}
              disabled={creating || !title.trim()}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              {creating ? "Legt an…" : "Reise anlegen"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lädt Reisen…</p>
      ) : trips.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Reisen. Lege die erste an oder füge Ereignisse aus dem Chat hinzu.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trips.map((trip) => (
            <Card
              key={trip.id}
              className="overflow-hidden border-border/80 shadow-sm"
            >
              <div
                className="h-36 bg-gradient-to-br from-teal-100 to-sky-100 bg-cover bg-center"
                style={
                  trip.cover_url
                    ? { backgroundImage: `url(${trip.cover_url})` }
                    : undefined
                }
              />
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/trips/${trip.id}`}
                      className="font-semibold hover:underline"
                    >
                      {trip.title}
                    </Link>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[
                        trip.destination,
                        trip.start_date
                          ? `${toSwissDate(trip.start_date)}${
                              trip.end_date
                                ? ` – ${toSwissDate(trip.end_date)}`
                                : ""
                            }`
                          : null,
                        `${trip.event_count ?? 0} Ereignisse`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {STATUS_LABEL[trip.status] || trip.status}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/trips/${trip.id}`}
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    Öffnen
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeTrip(trip.id, trip.title)}
                    title="Reise löschen"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
