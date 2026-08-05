import fs from "fs";
import path from "path";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { merchantDomainForKey } from "@/lib/finance/merchants";

/** Cached brand logos so statement lists don't call out on every render. */
export function getMerchantLogoDir(): string {
  return path.join(getTripsDataRoot(), "merchant-logos");
}

const MISSING_SUFFIX = ".missing";
/** Retry a failed lookup after a week rather than on every page view. */
const MISSING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function safeKey(key: string): string | null {
  const clean = path.basename(key).toLowerCase();
  if (!clean || !/^[a-z0-9-]{1,64}$/.test(clean)) return null;
  return clean;
}

function isFreshMissingMarker(file: string): boolean {
  try {
    const stat = fs.statSync(file);
    return Date.now() - stat.mtimeMs < MISSING_TTL_MS;
  } catch {
    return false;
  }
}

async function fetchLogo(domain: string): Promise<Buffer | null> {
  const sources = [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?sz=128&domain=${domain}`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      // Providers answer with a tiny placeholder when they have no icon.
      if (buffer.byteLength < 200) continue;
      return buffer;
    } catch {
      /* try next source */
    }
  }
  return null;
}

/**
 * Path to the cached PNG for a merchant key, downloading it once when missing.
 * Returns null for unknown merchants or when no provider has a logo.
 */
export async function resolveMerchantLogoFile(
  rawKey: string
): Promise<string | null> {
  const key = safeKey(rawKey);
  if (!key) return null;
  const domain = merchantDomainForKey(key);
  if (!domain) return null;

  const dir = getMerchantLogoDir();
  const file = path.join(dir, `${key}.png`);
  if (fs.existsSync(file)) return file;

  const missingMarker = `${file}${MISSING_SUFFIX}`;
  if (isFreshMissingMarker(missingMarker)) return null;

  fs.mkdirSync(dir, { recursive: true });
  const downloaded = await fetchLogo(domain);
  if (!downloaded) {
    fs.writeFileSync(missingMarker, "");
    return null;
  }

  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(downloaded)
      .resize(64, 64, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    fs.writeFileSync(file, png);
    try {
      fs.unlinkSync(missingMarker);
    } catch {
      /* no marker to clear */
    }
    return file;
  } catch {
    fs.writeFileSync(missingMarker, "");
    return null;
  }
}
