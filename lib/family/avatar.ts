import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { getTripsDataRoot } from "@/lib/trips/paths";
import {
  getFamilyMemberById,
  setFamilyMemberAvatar,
  type FamilyGender,
  type FamilyMemberRow,
} from "@/lib/family/queries";

export function getFamilyAvatarsDir(): string {
  return path.join(getTripsDataRoot(), "family-avatars");
}

export function ensureFamilyAvatarsDir(): void {
  fs.mkdirSync(getFamilyAvatarsDir(), { recursive: true });
}

export function familyAvatarPublicUrl(
  avatarPath: string | null | undefined
): string | null {
  if (!avatarPath) return null;
  return `/api/family/media/avatar/${encodeURIComponent(
    path.basename(avatarPath)
  )}`;
}

export function resolveFamilyAvatarPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getFamilyAvatarsDir(), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

function deleteAvatarFile(filePath: string | null | undefined) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export function buildFamilyAvatarPrompt(
  displayName: string,
  gender: FamilyGender
): string {
  const who =
    gender === "female"
      ? "an adult woman"
      : gender === "male"
        ? "an adult man"
        : "an adult person";
  const nameHint = displayName.trim()
    ? ` Inspired by the name «${displayName.trim()}» (do not render any text or letters).`
    : "";
  return [
    `Friendly circular profile portrait avatar of ${who}, head-and-shoulders, soft studio light,`,
    "warm natural skin tones, simple solid sage-green background (#d9e4d1),",
    "clean modern illustration / soft 3D cartoon style, no text, no logo, no watermark,",
    "centered face, suitable as a tiny 64px UI avatar.",
    nameHint,
  ].join(" ");
}

async function writeAvatarJpeg(
  memberId: number,
  source: Buffer
): Promise<string> {
  ensureFamilyAvatarsDir();
  const jpeg = await sharp(source)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const filename = `family-${memberId}-${randomUUID().slice(0, 8)}.jpg`;
  const fullPath = path.join(getFamilyAvatarsDir(), filename);
  fs.writeFileSync(fullPath, jpeg);
  return fullPath;
}

export async function generateFamilyMemberAvatar(
  memberId: number,
  options?: { gender?: FamilyGender; displayName?: string }
): Promise<FamilyMemberRow> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt.");
  }
  const member = getFamilyMemberById(memberId);
  if (!member) throw new Error("Familienmitglied nicht gefunden");

  const gender =
    options?.gender !== undefined ? options.gender : member.gender;
  const displayName =
    options?.displayName?.trim() || member.display_name;
  const prompt = buildFamilyAvatarPrompt(displayName, gender);

  const client = getOpenAIClient();
  const result = await client.images.generate({
    model: "gpt-image-2",
    prompt,
    size: "1024x1024",
    quality: "low",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildgenerierung lieferte kein Bild.");

  const fullPath = await writeAvatarJpeg(
    memberId,
    Buffer.from(b64, "base64")
  );
  deleteAvatarFile(member.avatar_path);
  return setFamilyMemberAvatar(memberId, {
    avatarPath: fullPath,
    avatarPrompt: prompt,
  });
}

export async function saveFamilyMemberAvatarUpload(
  memberId: number,
  fileBuffer: Buffer
): Promise<FamilyMemberRow> {
  const member = getFamilyMemberById(memberId);
  if (!member) throw new Error("Familienmitglied nicht gefunden");
  const fullPath = await writeAvatarJpeg(memberId, fileBuffer);
  deleteAvatarFile(member.avatar_path);
  return setFamilyMemberAvatar(memberId, {
    avatarPath: fullPath,
    avatarPrompt: null,
  });
}

export function clearFamilyMemberAvatar(memberId: number): FamilyMemberRow {
  const member = getFamilyMemberById(memberId);
  if (!member) throw new Error("Familienmitglied nicht gefunden");
  deleteAvatarFile(member.avatar_path);
  return setFamilyMemberAvatar(memberId, {
    avatarPath: null,
    avatarPrompt: null,
  });
}
