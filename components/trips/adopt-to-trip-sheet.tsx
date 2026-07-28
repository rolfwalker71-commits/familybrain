"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Luggage } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/components/auth/auth-provider";
import type { TripEventDraft } from "@/lib/trips/constants";
import { coerceTripEventType } from "@/lib/trips/constants";
import { summarizeDraftBatch } from "@/lib/trips/from-travel-item";
import { cn } from "@/lib/utils";

type TripOption = { id: number; title: string };

type FinanceSuggestion = {
  amount: number;
  currency: string;
  description: string;
  expenseDate: string | null;
  documentId: number | null;
  source: "financial_item" | "travel_item";
};

type Props = {
  draft?: TripEventDraft;
  drafts?: TripEventDraft[];
  onDone?: (message: string) => void;
  onError?: (message: string) => void;
};

function eventLabel(draft: TripEventDraft): string {
  const type = coerceTripEventType(draft.type);
  const when = [draft.start_date, draft.start_time].filter(Boolean).join(" ");
  return [type, draft.title, when].filter(Boolean).join(" · ");
}

async function maybeEnrichEvents(
  tripId: number,
  events: Array<{
    id: number;
    event_type?: string;
    flight_number?: string | null;
    location?: string | null;
    address?: string | null;
    place_name?: string | null;
    origin_place?: string | null;
    destination_place?: string | null;
  }>
) {
  await Promise.allSettled(
    events.map(async (event) => {
      const type = coerceTripEventType(event.event_type);
      if (type === "Flug" && event.flight_number?.trim()) {
        await fetch(
          `/api/trips/${tripId}/events/${event.id}/enrich-flight`,
          { method: "POST" }
        );
        return;
      }
      if (
        (type === "Hotel" || type === "Unterkunft") &&
        (event.address || event.location || event.place_name)
      ) {
        const searchRes = await fetch(
          `/api/trips/${tripId}/events/${event.id}/enrich-place`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        const searchData = await searchRes.json().catch(() => null);
        const candidates = searchData?.candidates;
        if (
          searchRes.ok &&
          Array.isArray(candidates) &&
          candidates.length === 1
        ) {
          await fetch(
            `/api/trips/${tripId}/events/${event.id}/enrich-place`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ candidate: candidates[0] }),
            }
          );
        }
      }
    })
  );
}

export function AdoptToTripSheet({ draft, drafts, onDone, onError }: Props) {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const isAdmin = !authLoading && Boolean(me?.isAdmin);

  const allDrafts = useMemo(() => {
    if (drafts && drafts.length > 0) return drafts;
    if (draft) return [draft];
    return [];
  }, [draft, drafts]);

  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [tripId, setTripId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<boolean[]>([]);
  const [includeFinance, setIncludeFinance] = useState(false);
  const [suggestion, setSuggestion] = useState<FinanceSuggestion | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CHF");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [enrichAfter, setEnrichAfter] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelected(allDrafts.map(() => true));
    setIncludeFinance(false);
    setSuggestion(null);
    setAmount("");
    setCurrency("CHF");
    setDescription("");
    void (async () => {
      const res = await fetch("/api/trips");
      const data = await res.json();
      if (res.ok) {
        setTrips(
          (data.trips || []).map((t: { id: number; title: string }) => ({
            id: t.id,
            title: t.title,
          }))
        );
      }
    })();
    void (async () => {
      try {
        const documentIds = [
          ...new Set(
            allDrafts
              .map((d) => d.document_id)
              .filter((id): id is number => typeof id === "number" && id > 0)
          ),
        ];
        const travelItemIds = [
          ...new Set(
            allDrafts
              .map((d) => d.travel_item_id)
              .filter((id): id is number => typeof id === "number" && id > 0)
          ),
        ];
        if (documentIds.length === 0 && travelItemIds.length === 0) return;
        const params = new URLSearchParams();
        if (documentIds.length) params.set("documentIds", documentIds.join(","));
        if (travelItemIds.length)
          params.set("travelItemIds", travelItemIds.join(","));
        if (allDrafts[0]?.title) params.set("title", allDrafts[0].title);
        const res = await fetch(`/api/trips/adopt?${params.toString()}`);
        const data = await res.json();
        if (res.ok && data.suggestion) {
          const s = data.suggestion as FinanceSuggestion;
          setSuggestion(s);
          setAmount(String(s.amount));
          setCurrency(s.currency || "CHF");
          setDescription(s.description || "");
        }
      } catch {
        /* optional */
      }
    })();
  }, [open, allDrafts]);

  const selectedDrafts = allDrafts.filter((_, i) => selected[i]);

  async function submit() {
    if (selectedDrafts.length === 0) {
      onError?.("Bitte mindestens ein Ereignis auswählen.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/trips/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: tripId ? Number(tripId) : null,
          newTripTitle: !tripId && newTitle.trim() ? newTitle.trim() : null,
          drafts: selectedDrafts,
          finance: includeFinance
            ? {
                include: true,
                amount: Number(amount),
                currency: currency.trim().toUpperCase() || "CHF",
                description: description.trim() || null,
                documentId: suggestion?.documentId ?? null,
                linkToEventIndex: 0,
              }
            : { include: false },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");

      if (enrichAfter && Array.isArray(data.events)) {
        await maybeEnrichEvents(data.trip.id, data.events);
      }

      setOpen(false);
      setNewTitle("");
      const parts = [
        selectedDrafts.length > 1
          ? `${selectedDrafts.length} Ereignisse übernommen`
          : "Ereignis übernommen",
      ];
      if (data.expenseId) parts.push("Kosten erfasst");
      onDone?.(parts.join(" · ") + ".");
      router.push(`/trips/${data.trip.id}?event=${data.eventIds?.[0] ?? ""}`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const label =
    allDrafts.length > 1
      ? `Zur Reise (${allDrafts.length})`
      : "Zur Reise";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
        title="Zu TravelBuddy hinzufügen"
        disabled={allDrafts.length === 0}
      >
        <Luggage className="size-3.5" />
        {label}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Als Reise übernehmen</SheetTitle>
            <SheetDescription>
              Nur nach Bestätigung — nichts wird automatisch importiert.{" "}
              {summarizeDraftBatch(allDrafts)}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-1 flex-col gap-5 px-1 pb-6">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                1 · Reise
              </p>
              <div className="space-y-1.5">
                <Label>Bestehende Reise</Label>
                <Select
                  value={tripId || undefined}
                  onValueChange={(value) => {
                    if (value == null) return;
                    setTripId(value);
                    setNewTitle("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Reise wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {trips.map((trip) => (
                      <SelectItem key={trip.id} value={String(trip.id)}>
                        {trip.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin ? (
                <div className="space-y-1.5">
                  <Label>Oder neue Reise</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => {
                      setNewTitle(e.target.value);
                      if (e.target.value.trim()) setTripId("");
                    }}
                    placeholder="Titel der neuen Reise"
                  />
                </div>
              ) : null}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2 · Ereignisse
              </p>
              <ul className="space-y-2">
                {allDrafts.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 px-3 py-2.5 text-sm",
                        selected[index] ? "bg-muted/30" : "opacity-60"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 rounded border-border"
                        checked={Boolean(selected[index])}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = [...prev];
                            next[index] = e.target.checked;
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0 leading-snug">
                        {eventLabel(item)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                3 · Kosten (optional)
              </p>
              <label className="flex items-start gap-2.5 rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 rounded border-border"
                  checked={includeFinance}
                  onChange={(e) => setIncludeFinance(e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="font-medium">Kosten auch übernehmen</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Legt nur bei Aktivierung eine Ausgabe im Trip-Ledger an.
                    {suggestion
                      ? ` Vorschlag aus ${
                          suggestion.source === "financial_item"
                            ? "Rechnung"
                            : "Reisebeleg"
                        }.`
                      : " Kein Betrag erkannt — Betrag manuell eintragen."}
                  </span>
                </span>
              </label>

              {includeFinance || suggestion ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label>Betrag</Label>
                    <Input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        if (e.target.value.trim()) setIncludeFinance(true);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Währung</Label>
                    <Input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      maxLength={3}
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label>Beschreibung</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="z. B. Flugticket"
                    />
                  </div>
                </div>
              ) : null}
            </section>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 rounded border-border"
                checked={enrichAfter}
                onChange={(e) => setEnrichAfter(e.target.checked)}
              />
              <span>
                <span className="font-medium">Anreichern (Flug/Hotel)</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Versucht nach dem Übernehmen Flug- und Ortsdaten nachzuladen.
                  Zugverbindungen bleiben manuell.
                </span>
              </span>
            </label>

            <div className="mt-auto flex gap-2 pt-2">
              <Button
                className="flex-1"
                disabled={
                  saving ||
                  selectedDrafts.length === 0 ||
                  (!tripId && !newTitle.trim()) ||
                  (includeFinance && !(Number(amount) > 0))
                }
                onClick={() => void submit()}
              >
                {saving
                  ? "Übernimmt…"
                  : selectedDrafts.length > 1
                    ? `${selectedDrafts.length} übernehmen`
                    : "Übernehmen"}
              </Button>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
