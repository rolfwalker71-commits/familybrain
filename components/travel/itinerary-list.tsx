"use client";

import { MapPin } from "lucide-react";
import { toSwissDate } from "@/lib/utils/dates";
import type { ItineraryStop } from "@/lib/extraction/itinerary";
import {
  itineraryStopToCalendarEvent,
  itineraryToCalendarEvents,
} from "@/lib/extraction/itinerary-calendar";
import { IconCircle } from "@/components/layout/icon-circle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";

function whenLabel(stop: ItineraryStop): string {
  if (stop.date) return toSwissDate(stop.date);
  return stop.day_label || "–";
}

function timeLabel(stop: ItineraryStop): string | null {
  const parts = [
    stop.arrive ? `Ankunft ${stop.arrive}` : null,
    stop.depart ? `Abfahrt ${stop.depart}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : stop.note;
}

export function ItineraryList({
  stops,
  compact = false,
  calendarFilename = "familybrain-reiseverlauf",
  titlePrefix = "Anlauf",
  showAllExport = false,
}: {
  stops: ItineraryStop[];
  compact?: boolean;
  calendarFilename?: string;
  titlePrefix?: string;
  /** Show "Alle in Kalender" above the list (when not wrapped in ItineraryCard). */
  showAllExport?: boolean;
}) {
  if (stops.length === 0) return null;

  const allEvents = itineraryToCalendarEvents(stops, {
    titlePrefix,
    uidPrefix: calendarFilename,
  });

  return (
    <div className="space-y-2">
      {showAllExport && allEvents.length > 0 ? (
        <div className="flex justify-end">
          <AddToCalendarButton
            events={allEvents}
            filename={calendarFilename}
            label="Alle in Kalender"
            size="sm"
            variant="outline"
          />
        </div>
      ) : null}
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {stops.map((stop, i) => {
          const event = itineraryStopToCalendarEvent(stop, {
            titlePrefix,
            uidPrefix: calendarFilename,
          });
          return (
            <div
              key={`${stop.day_label}-${stop.location}-${i}`}
              className="flex min-w-0 items-start justify-between gap-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{stop.location}</div>
                {timeLabel(stop) ? (
                  <div className="text-xs text-muted-foreground">
                    {timeLabel(stop)}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="tabular-nums text-muted-foreground">
                  {whenLabel(stop)}
                </span>
                {event ? (
                  <AddToCalendarButton
                    events={[event]}
                    filename={`${calendarFilename}-${i + 1}`}
                    size="icon-sm"
                    variant="ghost"
                    className="text-teal-700 hover:bg-teal-50 hover:text-teal-900"
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ItineraryCard({
  stops,
  calendarFilename = "familybrain-reiseverlauf",
  titlePrefix = "Anlauf",
}: {
  stops: ItineraryStop[];
  calendarFilename?: string;
  titlePrefix?: string;
}) {
  if (stops.length === 0) return null;

  const allEvents = itineraryToCalendarEvents(stops, {
    titlePrefix,
    uidPrefix: calendarFilename,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-3 text-base">
          <IconCircle icon={MapPin} tone="teal" size="sm" />
          Reiseverlauf / Ports of Call
        </CardTitle>
        {allEvents.length > 0 ? (
          <AddToCalendarButton
            events={allEvents}
            filename={calendarFilename}
            label="Alle in Kalender"
            size="sm"
            variant="outline"
          />
        ) : null}
      </CardHeader>
      <CardContent>
        <ItineraryList
          stops={stops}
          calendarFilename={calendarFilename}
          titlePrefix={titlePrefix}
        />
      </CardContent>
    </Card>
  );
}
