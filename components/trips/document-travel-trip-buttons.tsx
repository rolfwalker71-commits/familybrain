"use client";

import { useEffect, useState } from "react";
import { AddToTripButton } from "@/components/trips/add-to-trip-button";
import { LinkBelegToEventButton } from "@/components/trips/link-beleg-to-event-button";
import type { TripEventDraft } from "@/lib/trips/constants";
import {
  summarizeDraftBatch,
  travelItemToEventDrafts,
} from "@/lib/trips/from-travel-item";

type TravelItem = {
  id: number;
  travel_type: string | null;
  travel_type_override?: string | null;
  provider: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  origin: string | null;
  destination: string | null;
  booking_reference: string | null;
  extracted_data?: string | null;
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

  const belegButton = (
    <LinkBelegToEventButton
      documentId={documentId}
      onDone={onDone}
      onError={onError}
    />
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <AddToTripButton
          draft={{
            type: "Sonstiges",
            title: documentTitle || `Dokument #${documentId}`,
            document_id: documentId,
          }}
          onDone={onDone}
          onError={onError}
        />
        {belegButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => {
        const drafts: TripEventDraft[] = travelItemToEventDrafts({
          ...item,
          document_id: documentId,
        });
        return (
          <div key={item.id} className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Beleg: {summarizeDraftBatch(drafts)}
            </span>
            <AddToTripButton
              drafts={drafts}
              onDone={onDone}
              onError={onError}
            />
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">{belegButton}</div>
    </div>
  );
}
