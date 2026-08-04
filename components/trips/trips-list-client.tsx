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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/layout/page-primitives";
import {
  ListSortControl,
  useListSortDir,
} from "@/components/layout/list-sort-control";
import { pageVisuals } from "@/components/layout/icon-circle";
import { useAuth } from "@/components/auth/auth-provider";
import { TodayHub } from "@/components/trips/today-hub";
import { toSwissDate } from "@/lib/utils/dates";
import { TRIP_STATUSES } from "@/lib/trips/constants";
import { SoftFab } from "@/components/layout/soft-ui";
import { ModuleBackupCard } from "@/components/layout/module-backup-card";

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
  const { me, loading: authLoading } = useAuth();
  const isAdmin = !authLoading && Boolean(me?.isAdmin);
  const showTodayHub =
    isAdmin || Boolean(me?.showTodayHub);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState<(typeof TRIP_STATUSES)[number]>("planned");
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortDir, setSortDir] = useListSortDir("trips", "desc");

  async function load(dir = sortDir) {
    setLoading(true);
    try {
      const res = await fetch(`/api/trips?sortDir=${dir}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortDir]);

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
    }
  }

  // Render helper (not a nested component) — nested components remount on every
  // keystroke and steal focus from text inputs.
  function renderCreateForm(compact?: boolean) {
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
            className="w-full bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90 sm:w-auto"
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
        title="TravelBuddy"
        description="Reisen planen, Ereignisse sammeln und Timeline verwalten"
        icon={pageVisuals.trips.icon}
        tone={pageVisuals.trips.tone}
        actions={
          <ListSortControl
            storageKey="trips"
            label="Startdatum"
            defaultDir="desc"
            dir={sortDir}
            onDirChange={setSortDir}
          />
        }
      />

      {showTodayHub ? <TodayHub /> : null}

      {isAdmin ? (
        <Card className="hidden border-border shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.1)] md:block">
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-[var(--brand-finance)]">
              Neue Reise
            </p>
            {renderCreateForm()}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <ModuleBackupCard
          title="TravelBuddy-Backup (Modul-JSON)"
          exportHref="/api/trips/backup"
          onImport={importBackup}
          hint={
            <>
              Nur Reisen/Moduldaten — kein Disaster-Recovery. Server-Backup:{" "}
              <Link
                href="/settings?tab=notify"
                className="underline-offset-2 hover:underline"
              >
                Einstellungen → Backup & Hinweise
              </Link>{" "}
              · <code className="text-[10px]">docs/backup-restic.md</code>
            </>
          }
        />
      ) : null}

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
          {isAdmin ? (
            <Button
              size="sm"
              variant="outline"
              className="md:hidden"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1 size-4" />
              Neu
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt Reisen…</p>
        ) : trips.length === 0 ? (
          <Card className="border-border shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.1)]">
            <CardContent className="space-y-3 p-6 text-center">
              <p className="text-base font-medium">Noch keine Reise geplant</p>
              <p className="text-sm text-muted-foreground">
                Lege die erste Reise an — Timeline, Kosten und Teilen kommen
                danach. Paperless-Belege findest du unter Reise-Gedächtnis.
              </p>
              {isAdmin ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button
                    className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="mr-2 size-4" />
                    Erste Reise anlegen
                  </Button>
                  <Link
                    href="/travel"
                    className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
                  >
                    Zum Reise-Gedächtnis
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {trips.map((trip) => (
              <Card
                key={trip.id}
                className="overflow-hidden border-border shadow-[0_2px_4px_rgba(20,32,28,0.06),0_10px_28px_rgba(20,32,28,0.1)]"
              >
                <div
                  className="h-36 bg-gradient-to-br from-[var(--brand-finance-soft)] to-emerald-100 bg-cover bg-center"
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
                    {isAdmin ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void removeTrip(trip.id, trip.title)}
                        title="Reise löschen"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {isAdmin ? (
        <>
          <SoftFab
            accent="green"
            label="Neue Reise"
            aria-label="Neue Reise"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-6" />
          </SoftFab>

          <Sheet open={createOpen} onOpenChange={setCreateOpen}>
            <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Neue Reise</SheetTitle>
                <SheetDescription>
                  Titel und optional Ziel festlegen.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                {renderCreateForm(true)}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  );
}
