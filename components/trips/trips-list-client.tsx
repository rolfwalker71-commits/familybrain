"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Plus, Trash2, Upload } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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
      setCreateOpen(false);
      await load();
      if (data.trip?.id) {
        window.location.assign(`/trips/${data.trip.id}`);
      }
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

  async function importBackup(file: File) {
    setError(null);
    setStatusMsg(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const res = await fetch("/api/trips/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen");
      await load();
      const warn =
        Array.isArray(data.warnings) && data.warnings.length
          ? ` · ${data.warnings.length} Hinweise`
          : "";
      setStatusMsg(
        `Import: ${data.tripsCreated} Reisen, ${data.eventsCreated} Aktivitäten, ${data.linksRestored} Beleg-Links${warn}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function CreateForm({ compact }: { compact?: boolean }) {
    return (
      <div className={cn("grid gap-3", !compact && "sm:grid-cols-4")}>
        <div className={cn("space-y-1.5", !compact && "sm:col-span-2")}>
          <Label htmlFor={compact ? "tripTitleMobile" : "tripTitle"}>
            Name
          </Label>
          <Input
            id={compact ? "tripTitleMobile" : "tripTitle"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Kreuzfahrt Karibik 2026"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={compact ? "tripDestMobile" : "tripDest"}>
            Ziel (optional)
          </Label>
          <Input
            id={compact ? "tripDestMobile" : "tripDest"}
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
        <div className={cn(!compact && "sm:col-span-4")}>
          <Button
            className="w-full sm:w-auto"
            onClick={() => void createTrip()}
            disabled={creating || !title.trim()}
          >
            <Plus className="mr-2 size-4" />
            {creating ? "Legt an…" : "Reise anlegen"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="TravelBrain"
        description="Reisen planen, Ereignisse sammeln und Timeline verwalten"
        icon={pageVisuals.trips.icon}
        tone={pageVisuals.trips.tone}
      />

      <Card className="hidden border-border/80 shadow-sm md:block">
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-medium">Neue Reise</p>
          <CreateForm />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <p className="mr-auto text-sm text-muted-foreground">
            TravelBrain-Backup
          </p>
          <a
            href="/api/trips/backup"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5"
            )}
          >
            <Download className="size-3.5" />
            Export
          </a>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importBackup(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => importRef.current?.click()}
          >
            <Upload className="size-3.5" />
            Import
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {statusMsg ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {statusMsg}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Meine Reisen</h2>
          <Button
            size="sm"
            variant="outline"
            className="md:hidden"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 size-4" />
            Neu
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt Reisen…</p>
        ) : trips.length === 0 ? (
          <Card className="border-border/80 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                Noch keine Reisen.
              </p>
              <Button
                className="w-full md:hidden"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 size-4" />
                Erste Reise anlegen
              </Button>
            </CardContent>
          </Card>
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
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" }),
                        "flex-1 sm:flex-none"
                      )}
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

      <button
        type="button"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg md:hidden"
        aria-label="Neue Reise"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="size-6" />
      </button>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Neue Reise</SheetTitle>
            <SheetDescription>
              Titel und optional Ziel festlegen.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <CreateForm compact />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
