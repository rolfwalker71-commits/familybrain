/** Client + server safe URL for Buddy static place map snippets. */
import {
  encodeGooglePolyline,
  subsamplePolyline,
} from "@/lib/google/polyline";

export function placeMapImageSrc(
  lat: number,
  lon: number,
  zoom = 13
): string {
  return `/api/dashboard/place-map?lat=${lat}&lon=${lon}&z=${zoom}&v=gmaps6`;
}

export function routeMapImageSrc(input: {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  /** Flüge: Orthodrome; Transfer/Zug: Gerade (oder pathPoints). */
  route?: "geodesic" | "straight";
  /** Expliziter Zoom (Slider); ohne → Auto-Fit mit Padding. */
  zoom?: number;
  /** Optional Zwischenpunkte [lat, lon][] — encoded an die API. */
  pathPoints?: Array<[number, number]>;
}): string {
  const params = new URLSearchParams({
    fromLat: String(input.fromLat),
    fromLon: String(input.fromLon),
    toLat: String(input.toLat),
    toLon: String(input.toLon),
    route: input.route || "straight",
    v: "gmaps6",
  });
  if (input.zoom != null && Number.isFinite(input.zoom)) {
    params.set("z", String(Math.round(input.zoom)));
  }
  if (input.pathPoints && input.pathPoints.length >= 2) {
    const pts = subsamplePolyline(
      input.pathPoints.map(([lat, lon]) => ({ lat, lon })),
      120
    );
    params.set("pathEnc", encodeGooglePolyline(pts));
  }
  return `/api/dashboard/place-map?${params.toString()}`;
}
