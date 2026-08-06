import fs from "fs";
import path from "path";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { hockeyTeamByKey, HOCKEY_TEAMS } from "@/lib/hockey/teams";
import {
  getSofascoreRemainingQuota,
  hasSofascoreApiKey,
  sofascoreGetTeamLogoPng,
} from "@/lib/hockey/sofascore";

export const HOCKEY_LOGOS_SOFASCORE_FLAG = "hockey_logos_sofascore_v1";

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

async function writeLogoPng(file: string, downloaded: Buffer): Promise<string> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

/**
 * Cache the official club mark as PNG.
 * Prefers Sofascore when a team id + API key are available; else Wikimedia / Wikipedia.
 */
export async function ensureHockeyLogo(input: {
  key: string;
  label?: string;
  force?: boolean;
  preferSofascore?: boolean;
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

  const useSofascore =
    (input.preferSofascore !== false) &&
    team?.sofascoreTeamId != null &&
    hasSofascoreApiKey() &&
    getSofascoreRemainingQuota() > 0;

  if (useSofascore && team?.sofascoreTeamId != null) {
    downloaded = await sofascoreGetTeamLogoPng(team.sofascoreTeamId);
  }

  if (!downloaded && team?.logoSourceUrl) {
    downloaded = await downloadImage(team.logoSourceUrl);
  }
  if (!downloaded && team?.wikipediaTitle) {
    downloaded = await fetchWikipediaThumbnail(team.wikipediaTitle);
  }
  if (!downloaded) return fs.existsSync(file) ? file : null;

  return writeLogoPng(file, downloaded);
}

/**
 * Gradually replace cached NL logos with Sofascore PNGs (2 per call to stay snappy).
 */
export async function ensureSofascoreLogosMigrated(): Promise<{
  refreshed: number;
  skipped: string;
}> {
  if (!hasSofascoreApiKey()) {
    return { refreshed: 0, skipped: "no-key" };
  }
  if (getSetting(HOCKEY_LOGOS_SOFASCORE_FLAG) === "1") {
    return { refreshed: 0, skipped: "done" };
  }

  const withIds = HOCKEY_TEAMS.filter((t) => t.sofascoreTeamId != null);
  const dir = getHockeyLogoDir();
  const pending = withIds.filter((team) => {
    // Always replace until flag is set — check a sidecar marker per team
    const marker = path.join(dir, `${team.key}.sofascore`);
    return !fs.existsSync(marker);
  });

  if (pending.length === 0) {
    setSetting(HOCKEY_LOGOS_SOFASCORE_FLAG, "1");
    return { refreshed: 0, skipped: "done" };
  }

  if (getSofascoreRemainingQuota() < 1) {
    return { refreshed: 0, skipped: "quota" };
  }

  const batch = pending.slice(0, 2);
  let refreshed = 0;
  for (const team of batch) {
    const file = await ensureHockeyLogo({
      key: team.key,
      label: team.label,
      force: true,
      preferSofascore: true,
    }).catch(() => null);
    if (file) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${team.key}.sofascore`), "1");
      refreshed += 1;
    }
  }

  const stillPending = withIds.some(
    (team) => !fs.existsSync(path.join(dir, `${team.key}.sofascore`))
  );
  if (!stillPending) {
    setSetting(HOCKEY_LOGOS_SOFASCORE_FLAG, "1");
  }

  return {
    refreshed,
    skipped: stillPending ? "partial" : "ok",
  };
}

/** Reset migration flag so logos are re-pulled on next overview load. */
export function resetSofascoreLogoMigration(): void {
  setSetting(HOCKEY_LOGOS_SOFASCORE_FLAG, null);
  const dir = getHockeyLogoDir();
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".sofascore")) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
}
