"use client";

import { cn } from "@/lib/utils";
import { coerceTripEventType } from "@/lib/trips/constants";
import { trainEnrichmentRoutePath } from "@/lib/trips/train-enrichment";
import { placeMapImageSrc } from "@/lib/maps/place-map-src";
import { TripMap, type TripMapPoint } from "@/components/trips/trip-map";

export { placeMapImageSrc } from "@/lib/maps/place-map-src";

/** Minimal geo/context fields needed to derive a map snippet for an event. */
export type EventMapGeoFields = {
  event_type: string;
  title: string;
  location?: string | null;
  origin_place?: string | null;
  destination_place?: string | null;
  lat?: number | null;
  lon?: number | null;
  map_image_url?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  departure_lat?: number | null;
  departure_lon?: number | null;
  arrival_lat?: number | null;
  arrival_lon?: number | null;
  enrichment_json?: string | null;
};

function isDualPlaceType(type: string): boolean {
  return (
    type === "Transfer" ||
    type === "Zugreisen" ||
    type === "Mietauto" ||
    type === "Mietwagen"
  );
}

function dualPlaceLabels(type: string): { origin: string; destination: string } {
  if (type === "Mietauto" || type === "Mietwagen") {
    return { origin: "Abholung", destination: "Rückgabe" };
  }
  return { origin: "Von", destination: "Nach" };
}

function splitTransferPlaces(event: EventMapGeoFields): {
  origin: string;
  destination: string;
} {
  if (event.origin_place || event.destination_place) {
    return {
      origin: event.origin_place || "",
      destination: event.destination_place || "",
    };
  }
  const loc = (event.location || "").trim();
  const parts = loc.split(/\s*(?:→|->|–)\s*/);
  if (parts.length >= 2) {
    return {
      origin: parts[0]?.trim() || "",
      destination: parts.slice(1).join(" → ").trim(),
    };
  }
  return { origin: loc, destination: "" };
}

export type EventMapModel = {
  kind: "place" | "route" | "endpoint";
  points: TripMapPoint[];
  drawRoute?: boolean;
  routeStyle?: "greatCircle" | "straight";
  routePath?: Array<[number, number]>;
  /** Static fallback image (e.g. no lat/lon but a saved map snapshot exists). */
  mapImageUrl?: string;
};

/**
 * Derive a single map snippet model for an event, mirroring the priority used
 * in the (former) expanded card detail view: flight great-circle > straight
 * transfer route > single place (lat/lon or static image) > single endpoint.
 */
export function getEventMapModel(
  event: EventMapGeoFields
): EventMapModel | null {
  const type = coerceTripEventType(event.event_type);
  const dual = isDualPlaceType(type);
  const dualLabels = dualPlaceLabels(type);
  const routePlaces = splitTransferPlaces(event);

  const hasFlightRouteMap =
    type === "Flug" &&
    event.departure_lat != null &&
    event.departure_lon != null &&
    event.arrival_lat != null &&
    event.arrival_lon != null;
  const hasStraightRouteMap =
    type !== "Flug" &&
    event.departure_lat != null &&
    event.departure_lon != null &&
    event.arrival_lat != null &&
    event.arrival_lon != null;

  if (hasFlightRouteMap) {
    return {
      kind: "route",
      points: [
        {
          lat: event.departure_lat!,
          lon: event.departure_lon!,
          label: event.departure_airport || "Von",
        },
        {
          lat: event.arrival_lat!,
          lon: event.arrival_lon!,
          label: event.arrival_airport || "Nach",
        },
      ],
      drawRoute: true,
      routeStyle: "greatCircle",
    };
  }

  if (hasStraightRouteMap) {
    const routePath =
      type === "Zugreisen" ? trainEnrichmentRoutePath(event.enrichment_json) : null;
    return {
      kind: "route",
      points: [
        {
          lat: event.departure_lat!,
          lon: event.departure_lon!,
          label: routePlaces.origin || dualLabels.origin,
        },
        {
          lat: event.arrival_lat!,
          lon: event.arrival_lon!,
          label: routePlaces.destination || dualLabels.destination,
        },
      ],
      drawRoute: true,
      routeStyle: "straight",
      routePath: routePath || undefined,
    };
  }

  if (!dual && event.lat != null && event.lon != null) {
    return { kind: "place", points: [{ lat: event.lat, lon: event.lon }] };
  }

  if (!dual && event.map_image_url) {
    return { kind: "place", points: [], mapImageUrl: event.map_image_url };
  }

  if (event.departure_lat != null && event.departure_lon != null) {
    return {
      kind: "endpoint",
      points: [
        {
          lat: event.departure_lat,
          lon: event.departure_lon,
          label: routePlaces.origin || dualLabels.origin,
        },
      ],
    };
  }

  if (event.arrival_lat != null && event.arrival_lon != null) {
    return {
      kind: "endpoint",
      points: [
        {
          lat: event.arrival_lat,
          lon: event.arrival_lon,
          label: routePlaces.destination || dualLabels.destination,
        },
      ],
    };
  }

  return null;
}

function StaticPlaceMapImage({
  lat,
  lon,
  zoom,
  alt,
  heightClassName,
  className,
}: {
  lat: number;
  lon: number;
  zoom?: number;
  alt: string;
  heightClassName: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border/70 bg-muted/30",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={placeMapImageSrc(lat, lon, zoom)}
        alt={alt}
        className={cn("w-full object-cover", heightClassName)}
        loading="lazy"
      />
    </div>
  );
}

/** Small map snippet ("Kartenausschnitt") for a trip event, or a static fallback image. */
export function EventMapSnippet({
  event,
  heightClassName = "h-28",
  className,
  compact = true,
}: {
  event: EventMapGeoFields;
  heightClassName?: string;
  className?: string;
  compact?: boolean;
}) {
  const model = getEventMapModel(event);
  if (!model) return null;

  // Orts-/Endpunkt-Ausschnitte: Google Static Maps (wie Dashboard), nicht Leaflet/OSM.
  // Routen (Flug/Transfer) bleiben interaktiv (Leaflet) wegen Pfadzeichnung.
  if (model.kind === "place" || model.kind === "endpoint") {
    const point = model.points[0];
    if (point) {
      return (
        <StaticPlaceMapImage
          lat={point.lat}
          lon={point.lon}
          zoom={15}
          alt={point.label ? `Karte: ${point.label}` : "Kartenausschnitt"}
          heightClassName={heightClassName}
          className={className}
        />
      );
    }
    if (model.mapImageUrl) {
      return (
        <div
          className={cn(
            "overflow-hidden rounded-md border border-border/70 bg-muted/30",
            className
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={model.mapImageUrl}
            alt="Kartenausschnitt"
            className={cn("w-full object-cover", heightClassName)}
          />
        </div>
      );
    }
    return null;
  }

  if (model.points.length === 0) return null;

  return (
    <TripMap
      points={model.points}
      drawRoute={model.drawRoute}
      routeStyle={model.routeStyle}
      routePath={model.routePath}
      heightClassName={heightClassName}
      className={className}
      compact={compact}
    />
  );
}
