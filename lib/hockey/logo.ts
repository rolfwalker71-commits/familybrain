import fs from "fs";
import path from "path";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { hockeyTeamByKey, HOCKEY_TEAMS } from "@/lib/hockey/teams";

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

async function downloadImage(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "BuddyHockey/1.0 (familybrain; local household app)",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength < 200) return null;
      const head = buffer.slice(0, 32).toString("utf8");
      if (head.includes("<!DOCTYPE") || head.includes("<html")) return null;
      return buffer;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

async function fetchWikipediaThumbnail(
  title: string
): Promise<Buffer | null> {
  for (const lang of ["en", "de"] as const) {
    const api = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      title
    )}&prop=pageimages&format=json&pithumbsize=500&pilicense=any`;
    try {
      const res = await fetch(api, {
        headers: {
          "User-Agent": "BuddyHockey/1.0 (familybrain; local household app)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
      };
      const pages = Object.values(json.query?.pages || {});
      const source = pages[0]?.thumbnail?.source;
      if (!source) continue;
      const img = await downloadImage(source.split("?")[0]!);
      if (img) return img;
    } catch {
      /* try next language */
    }
  }
  return null;
}

/**
 * Cache the official club mark as PNG.
 * Prefers curated Wikimedia URLs; falls back to Wikipedia pageimages.
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

  const team =
    hockeyTeamByKey(key) ||
    HOCKEY_TEAMS.find(
      (t) => t.label.toLowerCase() === (input.label || "").toLowerCase()
    ) ||
    null;

  let downloaded: Buffer | null = null;
  if (team?.logoSourceUrl) {
    downloaded = await downloadImage(team.logoSourceUrl);
  }
  if (!downloaded && team?.wikipediaTitle) {
    downloaded = await fetchWikipediaThumbnail(team.wikipediaTitle);
  }
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
