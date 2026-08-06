import fs from "fs";
import path from "path";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { HOCKEY_TEAMS, resolveHockeyTeam } from "@/lib/hockey/teams";

export function getHockeyLogoDir(): string {
  return path.join(getTripsDataRoot(), "hockey-logos");
}

function safeKey(key: string): string | null {
  const clean = path.basename(key).toLowerCase();
  if (!clean || !/^[a-z0-9-]{1,64}$/.test(clean)) return null;
  return clean;
}

export function resolveHockeyLogoFile(rawKey: string): string | null {
  const key = safeKey(rawKey);
  if (!key) return null;
  const file = path.join(getHockeyLogoDir(), `${key}.png`);
  return fs.existsSync(file) ? file : null;
}

function wikipediaTitleForKey(key: string, labelHint?: string): string | null {
  const known = HOCKEY_TEAMS.find((t) => t.key === key);
  if (known?.wikipediaTitle) return known.wikipediaTitle;
  if (labelHint) {
    const resolved = resolveHockeyTeam(labelHint);
    if (resolved.wikipediaTitle) return resolved.wikipediaTitle;
  }
  return null;
}

async function fetchWikipediaThumbnail(
  title: string
): Promise<Buffer | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title
  )}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BuddyHockey/1.0 (familybrain; local household app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    const source =
      json.originalimage?.source ||
      json.thumbnail?.source?.replace(/\/\d+px-/, "/500px-") ||
      json.thumbnail?.source;
    if (!source) return null;
    const img = await fetch(source, {
      headers: {
        "User-Agent": "BuddyHockey/1.0 (familybrain; local household app)",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!img.ok) return null;
    const buffer = Buffer.from(await img.arrayBuffer());
    if (buffer.byteLength < 200) return null;
    return buffer;
  } catch {
    return null;
  }
}

/**
 * Download the official club mark from Wikipedia/Wikimedia and cache as PNG.
 * Returns null when no page/logo is available.
 */
export async function ensureHockeyLogo(input: {
  key: string;
  label?: string;
  force?: boolean;
}): Promise<string | null> {
  const key = safeKey(input.key);
  if (!key) return null;
  const dir = getHockeyLogoDir();
  const file = path.join(dir, `${key}.png`);
  if (!input.force && fs.existsSync(file)) return file;

  const title = wikipediaTitleForKey(key, input.label);
  if (!title) return fs.existsSync(file) ? file : null;

  const downloaded = await fetchWikipediaThumbnail(title);
  if (!downloaded) return fs.existsSync(file) ? file : null;

  fs.mkdirSync(dir, { recursive: true });
  const sharp = (await import("sharp")).default;
  const png = await sharp(downloaded)
    .resize(128, 128, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();
  fs.writeFileSync(file, png);
  return file;
}
