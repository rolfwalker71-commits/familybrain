/**
 * Google Encoded Polyline Algorithm
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

export type PolylineLatLng = { lat: number; lon: number };

function encodeSigned(value: number): string {
  let s = value << 1;
  if (value < 0) s = ~s;
  let out = "";
  while (s >= 0x20) {
    out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
    s >>= 5;
  }
  out += String.fromCharCode(s + 63);
  return out;
}

export function encodeGooglePolyline(points: PolylineLatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let result = "";
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lon * 1e5);
    result += encodeSigned(lat - lastLat);
    result += encodeSigned(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return result;
}

export function decodeGooglePolyline(encoded: string): PolylineLatLng[] {
  const points: PolylineLatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lon: lng / 1e5 });
  }
  return points;
}

export function subsamplePolyline(
  points: PolylineLatLng[],
  maxPoints: number
): PolylineLatLng[] {
  if (points.length <= maxPoints) return points;
  const out: PolylineLatLng[] = [];
  const last = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(points[idx]!);
  }
  return out;
}
