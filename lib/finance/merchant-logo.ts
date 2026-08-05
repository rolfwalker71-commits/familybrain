import fs from "fs";
import path from "path";
import { getTripsDataRoot } from "@/lib/trips/paths";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";

/** All merchant marks use one AI art direction for a consistent list. */
export function getMerchantLogoDir(): string {
  return path.join(getTripsDataRoot(), "merchant-ai-logos");
}

function safeKey(key: string): string | null {
  const clean = path.basename(key).toLowerCase();
  if (!clean || !/^[a-z0-9-]{1,64}$/.test(clean)) return null;
  return clean;
}

export function resolveMerchantLogoFile(rawKey: string): string | null {
  const key = safeKey(rawKey);
  if (!key) return null;
  const file = path.join(getMerchantLogoDir(), `${key}.png`);
  return fs.existsSync(file) ? file : null;
}

export async function generateMerchantAiLogo(input: {
  key: string;
  label: string;
  force?: boolean;
}): Promise<string> {
  const key = safeKey(input.key);
  if (!key) throw new Error("Ungültiger Händler-Key");
  const label = input.label.replace(/\s+/g, " ").trim().slice(0, 100);
  if (!label) throw new Error("Händlername fehlt");
  if (!hasOpenAIKey()) throw new Error("OpenAI API-Key fehlt");

  const dir = getMerchantLogoDir();
  const file = path.join(dir, `${key}.png`);
  if (!input.force && fs.existsSync(file)) return file;
  fs.mkdirSync(dir, { recursive: true });

  const result = await getOpenAIClient().images.generate({
    model: "gpt-image-1.5",
    size: "1024x1024",
    quality: "low",
    prompt: [
      `Square merchant logo icon for «${label}».`,
      "If this is a known company, create a close, recognizable interpretation of its official logo; minor deviations are acceptable.",
      "If it is not a known company or is a generic statement label, invent a distinctive fitting emblem.",
      "Consistent Buddy app style: clean flat vector mark, centered, bold simple geometry,",
      "soft sage-green and brand-appropriate accent colors, pure white background, generous padding.",
      "No UI frame, no receipt, no mockup, no watermark. Avoid small text; a short brand letter is acceptable only when essential.",
    ].join(" "),
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildgenerierung lieferte kein Bild");
  const sharp = (await import("sharp")).default;
  const png = await sharp(Buffer.from(b64, "base64"))
    .resize(128, 128, {
      fit: "cover",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
  fs.writeFileSync(file, png);
  return file;
}
