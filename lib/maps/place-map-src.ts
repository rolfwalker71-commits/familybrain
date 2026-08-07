/** Client + server safe URL for Buddy static place map snippets. */
export function placeMapImageSrc(
  lat: number,
  lon: number,
  zoom = 13
): string {
  return `/api/dashboard/place-map?lat=${lat}&lon=${lon}&z=${zoom}&v=gmaps5`;
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
  /** Optional Zwischenpunkte [lat, lon][] — werden kompakt in die URL gepackt. */
  pathPoints?: Array<[number, number]>;
}): string {
  const params = new URLSearchParams({
    fromLat: String(input.fromLat),
    fromLon: String(input.fromLon),
    toLat: String(input.toLat),
    toLon: String(input.toLon),
    route: input.route || "straight",
    v: "gmaps5",
  });
  if (input.zoom != null && Number.isFinite(input.zoom)) {
    params.set("z", String(Math.round(input.zoom)));
  }
  if (input.pathPoints && input.pathPoints.length >= 2) {
    // URL kurz halten: max. ~40 Punkte subsamplen
    const pts = subsamplePath(input.pathPoints, 40);
    params.set(
      "path",
      pts.map(([lat, lon]) => `${lat},${lon}`).join("|")
    );
  }
  return `/api/dashboard/place-map?${params.toString()}`;
}

function subsamplePath(
  points: Array<[number, number]>,
  maxPoints: number
): Array<[number, number]> {
  if (points.length <= maxPoints) return points;
  const out: Array<[number, number]> = [];
  const last = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(points[idx]!);
  }
  return out;
}
