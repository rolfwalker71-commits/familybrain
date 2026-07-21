"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

export type TripMapPoint = {
  lat: number;
  lon: number;
  label?: string;
};

type Props = {
  points: TripMapPoint[];
  /** Draw a great-circle route when two points are provided */
  drawRoute?: boolean;
  className?: string;
  heightClassName?: string;
};

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

/** Approximate great-circle points between two lat/lon positions. */
function greatCircleLatLngs(
  a: TripMapPoint,
  b: TripMapPoint,
  steps = 48
): [number, number][] {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    );
  if (!Number.isFinite(d) || d < 1e-9) {
    return [
      [a.lat, a.lon],
      [b.lat, b.lon],
    ];
  }
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y =
      A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  return out;
}

function markerHtml(label?: string) {
  const tip = label
    ? `<span style="position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:4px;white-space:nowrap;font:600 10px/1 system-ui,sans-serif;background:#0f172a;color:#fff;padding:2px 5px;border-radius:4px;">${label}</span>`
    : "";
  return `<div style="position:relative;width:14px;height:14px;">${tip}<div style="width:14px;height:14px;border-radius:50%;background:#0f766e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div></div>`;
}

export function TripMap({
  points,
  drawRoute = false,
  className,
  heightClassName = "h-40",
}: Props) {
  const mapId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);

  const valid = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)
  );
  const pointsKey = JSON.stringify(
    valid.map((p) => [p.lat, p.lon, p.label ?? ""])
  );

  useEffect(() => {
    const current = (
      JSON.parse(pointsKey) as Array<[number, number, string]>
    ).map(([lat, lon, label]) => ({
      lat,
      lon,
      label: label || undefined,
    }));
    if (!containerRef.current || current.length === 0) return;
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      current.forEach((p) => {
        const ll = L.latLng(p.lat, p.lon);
        bounds.extend(ll);
        L.marker(ll, {
          icon: L.divIcon({
            className: "trip-map-marker",
            html: markerHtml(p.label),
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        }).addTo(map);
      });

      if (drawRoute && current.length >= 2) {
        const path = greatCircleLatLngs(current[0], current[current.length - 1]);
        L.polyline(path, {
          color: "#0f766e",
          weight: 3,
          opacity: 0.85,
        }).addTo(map);
        path.forEach(([lat, lon]) => bounds.extend([lat, lon]));
      }

      if (current.length === 1) {
        map.setView([current[0].lat, current[0].lon], 14);
      } else {
        map.fitBounds(bounds.pad(0.2));
      }

      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [pointsKey, drawRoute, mapId]);

  if (valid.length === 0) return null;

  return (
    <div className={cn("overflow-hidden rounded-md border border-border/70", className)}>
      <div
        ref={containerRef}
        id={`trip-map-${mapId}`}
        className={cn("w-full bg-muted/30", heightClassName)}
      />
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] text-muted-foreground">
        <span>© OpenStreetMap</span>
        {valid.length === 1 ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${valid[0].lat}&mlon=${valid[0].lon}#map=15/${valid[0].lat}/${valid[0].lon}`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            Grössere Karte
          </a>
        ) : valid.length >= 2 ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${valid[0].lat}&mlon=${valid[0].lon}#map=5/${valid[0].lat}/${valid[0].lon}`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            Grössere Karte
          </a>
        ) : null}
      </div>
    </div>
  );
}
