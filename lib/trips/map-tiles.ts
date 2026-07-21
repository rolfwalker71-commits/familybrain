/** Client-safe map tile styles for TravelBrain Leaflet maps. */

export const MAP_STYLES = ["voyager", "positron", "osm"] as const;
export type MapStyleId = (typeof MAP_STYLES)[number];

export const MAP_STYLE_LABELS: Record<MapStyleId, string> = {
  voyager: "Carto Voyager (farbig)",
  positron: "Carto Positron (hell)",
  osm: "OpenStreetMap (klassisch)",
};

export type MapTileConfig = {
  id: MapStyleId;
  url: string;
  maxZoom: number;
  subdomains?: string;
  attribution: string;
};

const TILES: Record<MapStyleId, MapTileConfig> = {
  voyager: {
    id: "voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    maxZoom: 20,
    subdomains: "abcd",
    attribution: "© OpenStreetMap © CARTO",
  },
  positron: {
    id: "positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    maxZoom: 20,
    subdomains: "abcd",
    attribution: "© OpenStreetMap © CARTO",
  },
  osm: {
    id: "osm",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  },
};

export function coerceMapStyle(raw: string | null | undefined): MapStyleId {
  const v = (raw || "").trim().toLowerCase();
  if ((MAP_STYLES as readonly string[]).includes(v)) {
    return v as MapStyleId;
  }
  return "voyager";
}

export function getMapTileConfig(
  style: MapStyleId | string | null | undefined = "voyager"
): MapTileConfig {
  return TILES[coerceMapStyle(style)];
}
