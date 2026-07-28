export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Match tags with optional XML namespace prefix (`ojp:Trip`, `siri:Latitude`, …). */
function tagOpenClose(tag: string): { open: string; close: string } {
  if (tag.includes(":")) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      open: `<${escaped}(?:\\s[^>]*)?>`,
      close: `</${escaped}>`,
    };
  }
  return {
    open: `<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>`,
    close: `</(?:[\\w.-]+:)?${tag}>`,
  };
}

export function extractBlocks(xml: string, tag: string): string[] {
  const results: string[] = [];
  const { open, close } = tagOpenClose(tag);
  const re = new RegExp(`${open}([\\s\\S]*?)${close}`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

export function extractFirstTag(xml: string, tag: string): string | null {
  const { open, close } = tagOpenClose(tag);
  const re = new RegExp(`${open}([\\s\\S]*?)${close}`, "i");
  const match = xml.match(re);
  if (!match) return null;
  return match[1];
}

export function extractTextValue(xml: string, tag: string): string | null {
  const inner = extractFirstTag(xml, tag);
  if (!inner) return null;
  const textMatch = inner.match(
    /<(?:[\w.-]+:)?Text(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?Text>/i
  );
  const raw = textMatch ? textMatch[1] : inner.replace(/<[^>]+>/g, "");
  const trimmed = decodeXml(raw.trim());
  return trimmed || null;
}

export function extractGeoPositions(xml: string): LatLngPair[] {
  const pairs: LatLngPair[] = [];
  const geoBlocks = extractBlocks(xml, "GeoPosition");
  for (const block of geoBlocks) {
    const pair = parseLatLon(block);
    if (pair) pairs.push(pair);
  }
  if (pairs.length > 0) return pairs;

  const latTags = [
    ...xml.matchAll(
      /<(?:[\w.-]+:)?Latitude(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?Latitude>/gi
    ),
  ];
  const lonTags = [
    ...xml.matchAll(
      /<(?:[\w.-]+:)?Longitude(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?Longitude>/gi
    ),
  ];
  const count = Math.min(latTags.length, lonTags.length);
  for (let i = 0; i < count; i++) {
    const lat = Number(latTags[i][1].trim());
    const lon = Number(lonTags[i][1].trim());
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      pairs.push({ lat, lon });
    }
  }
  return pairs;
}

type LatLngPair = { lat: number; lon: number };

function parseLatLon(block: string): LatLngPair | null {
  const latRaw =
    extractFirstTag(block, "siri:Latitude") ??
    extractFirstTag(block, "Latitude");
  const lonRaw =
    extractFirstTag(block, "siri:Longitude") ??
    extractFirstTag(block, "Longitude");
  if (!latRaw || !lonRaw) return null;
  const lat = Number(latRaw.trim());
  const lon = Number(lonRaw.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function mergePaths(
  paths: Array<Array<[number, number]>>
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const path of paths) {
    for (const point of path) {
      const prev = out[out.length - 1];
      if (
        prev &&
        Math.abs(prev[0] - point[0]) < 1e-6 &&
        Math.abs(prev[1] - point[1]) < 1e-6
      ) {
        continue;
      }
      out.push(point);
    }
  }
  return out;
}

/** Extract a short OJP error message from a response body, if present. */
export function extractOjpErrorMessage(xml: string): string | null {
  const candidates = [
    extractTextValue(xml, "ErrorText"),
    extractTextValue(xml, "ErrorDescription"),
    extractTextValue(xml, "Description"),
    extractFirstTag(xml, "faultstring"),
  ];
  for (const value of candidates) {
    const trimmed = value?.replace(/<[^>]+>/g, "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}
