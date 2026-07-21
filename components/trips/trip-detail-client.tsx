"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  ImagePlus,
  MapPin,
  Pencil,
  Plane,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { TRIP_EVENT_TYPES, TRIP_STATUSES } from "@/lib/trips/constants";

type Trip = {
  id: number;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  summary: string | null;
  notes: string | null;
  cover_url: string | null;
  cover_prompt: string | null;
};

type TripEvent = {
  id: number;
  event_type: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  provider: string | null;
  booking_reference: string | null;
  notes: string | null;
  flight_number: string | null;
  airline: string | null;
  aircraft_reg: string | null;
  aircraft_type: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  duration_minutes: number | null;
  aircraft_image_url: string | null;
  place_name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  map_image_url: string | null;
  osm_id: string | null;
};

type PlaceCandidate = {
  osmId: string;
  name: string;
  displayName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lon: number;
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  active: "Unterwegs",
  done: "Abgeschlossen",
  cancelled: "Abgesagt",
};

const emptyEventForm = {
  eventType: "Flug",
  title: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  location: "",
  address: "",
  provider: "",
  bookingReference: "",
  notes: "",
  flightNumber: "",
};

export function TripDetailClient({ tripId }: { tripId: number }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [meta, setMeta] = useState({
    title: "",
    destination: "",
    summary: "",
    notes: "",
    status: "planned",
    startDate: "",
    endDate: "",
  });
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [placeCandidates, setPlaceCandidates] = useState<
    Record<number, PlaceCandidate[]>
  >({});
  const [placeQueries, setPlaceQueries] = useState<Record<number, string>>(
    {}
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
    setTrip(data.trip);
    setEvents(data.events || []);
    setMeta({
      title: data.trip.title || "",
      destination: data.trip.destination || "",
      summary: data.trip.summary || "",
      notes: data.trip.notes || "",
      status: data.trip.status || "planned",
      startDate: data.trip.start_date || "",
      endDate: data.trip.end_date || "",
    });
  }, [tripId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, [load]);

  async function saveMeta() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meta.title,
          destination: meta.destination || null,
          summary: meta.summary || null,
          notes: meta.notes || null,
          status: meta.status,
          startDate: meta.startDate || null,
          endDate: meta.endDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEditingMeta(false);
      setStatus("Reise gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEvent() {
    if (!eventForm.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        eventType: eventForm.eventType,
        title: eventForm.title.trim(),
        startDate: eventForm.startDate || null,
        endDate: eventForm.endDate || null,
        startTime: eventForm.startTime || null,
        endTime: eventForm.endTime || null,
        location: eventForm.location || null,
        address: eventForm.address || null,
        provider: eventForm.provider || null,
        bookingReference: eventForm.bookingReference || null,
        notes: eventForm.notes || null,
        flightNumber: eventForm.flightNumber || null,
      };
      const url =
        editingEventId != null
          ? `/api/trips/${tripId}/events/${editingEventId}`
          : `/api/trips/${tripId}/events`;
      const res = await fetch(url, {
        method: editingEventId != null ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEventForm(emptyEventForm);
      setEditingEventId(null);
      setStatus(editingEventId != null ? "Ereignis aktualisiert." : "Ereignis hinzugefügt.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function startEditEvent(event: TripEvent) {
    setEditingEventId(event.id);
    setEventForm({
      eventType: event.event_type,
      title: event.title,
      startDate: event.start_date || "",
      endDate: event.end_date || "",
      startTime: event.start_time || "",
      endTime: event.end_time || "",
      location: event.location || "",
      address: event.address || "",
      provider: event.provider || "",
      bookingReference: event.booking_reference || "",
      notes: event.notes || "",
      flightNumber: event.flight_number || "",
    });
  }

  async function removeEvent(eventId: number) {
    if (!window.confirm("Ereignis wirklich löschen?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/events/${eventId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      if (editingEventId === eventId) {
        setEditingEventId(null);
        setEventForm(emptyEventForm);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTrip() {
    if (!trip) return;
    if (!window.confirm(`Reise «${trip.title}» wirklich löschen?`)) return;
    const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Löschen fehlgeschlagen");
      return;
    }
    window.location.href = "/trips";
  }

  async function uploadCover(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/trips/${tripId}/cover`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");
      await load();
      setStatus("Titelbild hochgeladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateCover() {
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate: true, prompt: coverPrompt || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generierung fehlgeschlagen");
      await load();
      setStatus("Titelbild erzeugt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function enrichFlight(eventId: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-flight`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anreicherung fehlgeschlagen");
      await load();
      setStatus("Flugdaten angereichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function searchPlace(eventId: number) {
    setBusy(true);
    setError(null);
    try {
      const event = events.find((e) => e.id === eventId);
      const defaultQuery = [
        event?.title,
        event?.address,
        event?.location,
        trip?.destination,
      ]
        .filter(Boolean)
        .join(", ");
      const query = (placeQueries[eventId] ?? defaultQuery).trim();
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query || undefined }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suche fehlgeschlagen");
      const candidates = (data.candidates || []) as PlaceCandidate[];
      setPlaceCandidates((prev) => ({
        ...prev,
        [eventId]: candidates,
      }));
      if (candidates.length === 0) {
        setStatus("Keine OSM-Treffer gefunden.");
      } else {
        setStatus(`${candidates.length} OSM-Treffer — bitte auswählen.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyPlace(eventId: number, candidate: PlaceCandidate) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trips/${tripId}/events/${eventId}/enrich-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
      setPlaceCandidates((prev) => ({ ...prev, [eventId]: [] }));
      await load();
      setStatus("Ort angereichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!trip) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="TravelBrain"
          description="Reise wird geladen…"
          icon={pageVisuals.travel.icon}
          tone={pageVisuals.travel.tone}
        />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/trips"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
        >
          <ArrowLeft className="size-4" />
          Alle Reisen
        </Link>
      </div>

      <div
        className="relative h-48 overflow-hidden rounded-xl bg-gradient-to-br from-teal-100 to-sky-100 bg-cover bg-center sm:h-64"
        style={
          trip.cover_url
            ? { backgroundImage: `url(${trip.cover_url})` }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{trip.title}</h1>
              <p className="mt-1 text-sm text-white/85">
                {[
                  trip.destination,
                  trip.start_date
                    ? `${toSwissDate(trip.start_date)}${
                        trip.end_date ? ` – ${toSwissDate(trip.end_date)}` : ""
                      }`
                    : null,
                  STATUS_LABEL[trip.status],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Badge className="bg-white/90 text-foreground hover:bg-white">
              {events.length} Ereignisse
            </Badge>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {status}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/trips/${tripId}/ics`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <CalendarPlus className="mr-1.5 size-4" />
          Kalender (ICS)
        </a>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditingMeta((v) => !v)}
        >
          <Pencil className="mr-1.5 size-4" />
          Reise bearbeiten
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void deleteTrip()}>
          <Trash2 className="mr-1.5 size-4" />
          Reise löschen
        </Button>
      </div>

      {editingMeta ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reise bearbeiten</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Titel</Label>
              <Input
                value={meta.title}
                onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ziel</Label>
              <Input
                value={meta.destination}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, destination: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={meta.status}
                onValueChange={(v) => {
                  if (v == null) return;
                  setMeta((m) => ({ ...m, status: v }));
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
            <div className="space-y-1.5">
              <Label>Von</Label>
              <Input
                type="date"
                value={meta.startDate}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, startDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bis</Label>
              <Input
                type="date"
                value={meta.endDate}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, endDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Kurzbeschreibung</Label>
              <Input
                value={meta.summary}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, summary: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notizen</Label>
              <Textarea
                value={meta.notes}
                onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button disabled={busy} onClick={() => void saveMeta()}>
                Speichern
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Titelbild</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="coverFile">Hochladen</Label>
            <Input
              id="coverFile"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCover(file);
              }}
            />
          </div>
          <div className="min-w-[16rem] flex-1 space-y-1.5">
            <Label>AI-Prompt (optional)</Label>
            <Input
              value={coverPrompt}
              onChange={(e) => setCoverPrompt(e.target.value)}
              placeholder="z. B. Karibik bei Sonnenuntergang, Kreuzfahrtschiff"
            />
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void generateCover()}
            className="gap-1.5"
          >
            <Sparkles className="size-4" />
            Mit AI erzeugen
          </Button>
          <Button variant="ghost" size="icon" disabled title="Upload">
            <ImagePlus className="size-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingEventId != null ? "Ereignis bearbeiten" : "Ereignis hinzufügen"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select
              value={eventForm.eventType}
              onValueChange={(v) => {
                if (v == null) return;
                setEventForm((f) => ({ ...f, eventType: v }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIP_EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input
              value={eventForm.title}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Datum von</Label>
            <Input
              type="date"
              value={eventForm.startDate}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, startDate: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Datum bis</Label>
            <Input
              type="date"
              value={eventForm.endDate}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, endDate: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Zeit von</Label>
            <Input
              type="time"
              value={eventForm.startTime}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, startTime: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Zeit bis</Label>
            <Input
              type="time"
              value={eventForm.endTime}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, endTime: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ort</Label>
            <Input
              value={eventForm.location}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, location: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Adresse</Label>
            <Input
              value={eventForm.address}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, address: e.target.value }))
              }
              placeholder="Straße, PLZ Ort"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Anbieter</Label>
            <Input
              value={eventForm.provider}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, provider: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Buchungsnr.</Label>
            <Input
              value={eventForm.bookingReference}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, bookingReference: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Flugnummer</Label>
            <Input
              value={eventForm.flightNumber}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, flightNumber: e.target.value }))
              }
              placeholder="z. B. LX123"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notizen</Label>
            <Textarea
              value={eventForm.notes}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button disabled={busy || !eventForm.title.trim()} onClick={() => void saveEvent()}>
              {editingEventId != null ? "Ereignis speichern" : "Ereignis hinzufügen"}
            </Button>
            {editingEventId != null ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingEventId(null);
                  setEventForm(emptyEventForm);
                }}
              >
                Abbrechen
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Timeline</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Ereignisse.</p>
        ) : (
          events.map((event) => (
            <Card key={event.id} className="border-border/80">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{event.event_type}</Badge>
                      <span className="font-medium">{event.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[
                        event.start_date
                          ? `${toSwissDate(event.start_date)}${
                              event.start_time ? ` ${event.start_time}` : ""
                            }`
                          : null,
                        event.end_date
                          ? `bis ${toSwissDate(event.end_date)}${
                              event.end_time ? ` ${event.end_time}` : ""
                            }`
                          : null,
                        event.location,
                        event.provider,
                        event.flight_number,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEditEvent(event)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeEvent(event.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {(event.airline ||
                  event.departure_airport ||
                  event.duration_minutes ||
                  event.aircraft_reg) && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                    {[
                      event.airline,
                      event.departure_airport && event.arrival_airport
                        ? `${event.departure_airport} → ${event.arrival_airport}`
                        : null,
                      event.duration_minutes
                        ? `${event.duration_minutes} Min.`
                        : null,
                      event.aircraft_type,
                      event.aircraft_reg,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}

                {(event.address ||
                  event.phone ||
                  event.website ||
                  event.place_name ||
                  event.map_image_url ||
                  event.osm_id) && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {event.place_name ? (
                      <div className="font-medium text-foreground">
                        {event.place_name}
                      </div>
                    ) : null}
                    {event.address ? <div>{event.address}</div> : null}
                    {event.phone ? <div>Tel: {event.phone}</div> : null}
                    {event.website ? (
                      <a
                        href={event.website}
                        className="text-blue-700 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Website
                      </a>
                    ) : null}
                    {event.lat != null && event.lon != null ? (
                      <div className="tabular-nums">
                        {event.lat.toFixed(5)}, {event.lon.toFixed(5)}
                      </div>
                    ) : null}
                    <div className="text-[10px]">© OpenStreetMap</div>
                  </div>
                )}

                {event.aircraft_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.aircraft_image_url}
                    alt={event.aircraft_reg || "Flugzeug"}
                    className="max-h-40 rounded-md object-cover"
                  />
                ) : null}
                {event.map_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.map_image_url}
                    alt="Kartenausschnitt"
                    className="max-h-48 w-full rounded-md object-cover"
                  />
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {event.event_type === "Flug" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void enrichFlight(event.id)}
                      className="gap-1.5"
                    >
                      <Plane className="size-3.5" />
                      Mit Fluginfos anreichern
                    </Button>
                  ) : null}
                  {event.event_type === "Hotel" ||
                  event.event_type === "Aktivität" ? (
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label
                          htmlFor={`place-query-${event.id}`}
                          className="text-xs"
                        >
                          OSM-Suche
                        </Label>
                        <Input
                          id={`place-query-${event.id}`}
                          value={
                            placeQueries[event.id] ??
                            [
                              event.title,
                              event.address,
                              event.location,
                              trip.destination,
                            ]
                              .filter(Boolean)
                              .join(", ")
                          }
                          onChange={(e) =>
                            setPlaceQueries((prev) => ({
                              ...prev,
                              [event.id]: e.target.value,
                            }))
                          }
                          placeholder="Hotelname, Ort…"
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void searchPlace(event.id)}
                        className="gap-1.5 shrink-0"
                      >
                        <MapPin className="size-3.5" />
                        Ort anreichern
                      </Button>
                    </div>
                  ) : null}
                </div>

                {(placeCandidates[event.id] || []).length > 0 ? (
                  <div className="space-y-2 rounded-md border border-border/70 p-2">
                    <div className="text-xs font-medium">OSM-Treffer wählen</div>
                    {placeCandidates[event.id].map((c) => (
                      <button
                        key={c.osmId}
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                        onClick={() => void applyPlace(event.id, c)}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className="text-muted-foreground">
                          {c.displayName}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {event.notes ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {event.notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
