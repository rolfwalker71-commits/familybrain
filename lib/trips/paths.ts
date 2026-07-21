import path from "path";
import fs from "fs";

export function getTripsDataRoot(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    const abs = path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
    return path.dirname(abs);
  }
  return path.join(process.cwd(), "data");
}

export function getTripCoversDir(): string {
  return path.join(getTripsDataRoot(), "trip-covers");
}

export function getTripAircraftDir(): string {
  return path.join(getTripsDataRoot(), "trip-aircraft");
}

export function getTripMapsDir(): string {
  return path.join(getTripsDataRoot(), "trip-maps");
}

export function ensureTripMediaDirs(): void {
  for (const dir of [
    getTripCoversDir(),
    getTripAircraftDir(),
    getTripMapsDir(),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
