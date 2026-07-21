"use client";

import { useEffect, useState } from "react";
import { AddToTripButton } from "@/components/trips/add-to-trip-button";
import type { TripEventDraft } from "@/lib/trips/constants";

type TravelItem = {
  id: number;
  travel_type: string | null;
  provider: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  origin: string | null;
  destination: string | null;
  booking_reference: string | null;
};

export function DocumentTravelTripButtons({
  documentId,
  documentTitle,
  onDone,
  onError,
}: {
  documentId: number;
  documentTitle?: string | null;
  onDone?: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const [items, setItems] = useState<TravelItem[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/travel-items`);
        const data = await res.json();
        if (res.ok) setItems(data.items || []);
      } catch {
        /* ignore */
      }
    })();
  }, [documentId]);

  if (items.length === 0) {
    return (
      <AddToTripButton
        draft={{
          type: "Sonstiges",
          title: documentTitle || `Dokument #${documentId}`,
          document_id: documentId,
        }}
        onDone={onDone}
        onError={onError}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => {
        const draft: TripEventDraft = {
          type: item.travel_type || "Sonstiges",
          title:
            item.title ||
            [item.origin, item.destination].filter(Boolean).join(" → ") ||
            documentTitle ||
            `Dokument #${documentId}`,
          start_date: item.start_date,
          end_date: item.end_date,
          provider: item.provider,
          booking_reference: item.booking_reference,
          location: [item.origin, item.destination].filter(Boolean).join(" → "),
          document_id: documentId,
          travel_item_id: item.id,
        };
        return (
          <div key={item.id} className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Beleg: {draft.type} · {draft.title}
            </span>
            <AddToTripButton draft={draft} onDone={onDone} onError={onError} />
          </div>
        );
      })}
    </div>
  );
}
