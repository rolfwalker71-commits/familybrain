import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/client";
import { getTripsDataRoot } from "@/lib/trips/paths";
import {
  getAppUserById,
  setUserAvatar,
  type AppUserRow,
  type UserGender,
} from "@/lib/users/queries";

export function getUserAvatarsDir(): string {
  return path.join(getTripsDataRoot(), "user-avatars");
}

export function ensureUserAvatarsDir(): void {
  fs.mkdirSync(getUserAvatarsDir(), { recursive: true });
}

export function userAvatarPublicUrl(
  avatarPath: string | null | undefined
): string | null {
  if (!avatarPath) return null;
  return `/api/users/media/avatar/${encodeURIComponent(
    path.basename(avatarPath)
  )}`;
}

export function avatarUrlForUserId(
  userId: number | null | undefined
): string | null {
  if (userId == null) return null;
  const user = getAppUserById(userId);
  return userAvatarPublicUrl(user?.avatar_path);
}

export function resolveUserAvatarPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe.includes("..")) return null;
  const full = path.join(getUserAvatarsDir(), safe);
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

export function buildUserAvatarPrompt(
  displayName: string,
  gender: UserGender
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
  userId: number,
  source: Buffer
): Promise<string> {
  ensureUserAvatarsDir();
  const jpeg = await sharp(source)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const filename = `user-${userId}-${randomUUID().slice(0, 8)}.jpg`;
  const fullPath = path.join(getUserAvatarsDir(), filename);
  fs.writeFileSync(fullPath, jpeg);
  return fullPath;
}

export async function generateUserAvatar(
  userId: number,
  options?: { gender?: UserGender; displayName?: string }
): Promise<AppUserRow> {
  if (!hasOpenAIKey()) {
    throw new Error("OpenAI API-Key fehlt.");
  }
  const user = getAppUserById(userId);
  if (!user) throw new Error("Benutzer nicht gefunden");

  const gender =
    options?.gender !== undefined ? options.gender : user.gender;
  const displayName = options?.displayName?.trim() || user.display_name;
  const prompt = buildUserAvatarPrompt(displayName, gender);

  const client = getOpenAIClient();
  const result = await client.images.generate({
    model: "gpt-image-2",
    prompt,
    size: "1024x1024",
    quality: "low",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildgenerierung lieferte kein Bild.");

  const fullPath = await writeAvatarJpeg(userId, Buffer.from(b64, "base64"));
  deleteAvatarFile(user.avatar_path);
  return setUserAvatar(userId, {
    avatarPath: fullPath,
    avatarPrompt: prompt,
  });
}

export async function saveUserAvatarUpload(
  userId: number,
  fileBuffer: Buffer
): Promise<AppUserRow> {
  const user = getAppUserById(userId);
  if (!user) throw new Error("Benutzer nicht gefunden");
  const fullPath = await writeAvatarJpeg(userId, fileBuffer);
  deleteAvatarFile(user.avatar_path);
  return setUserAvatar(userId, {
    avatarPath: fullPath,
    avatarPrompt: null,
  });
}

export function clearUserAvatar(userId: number): AppUserRow {
  const user = getAppUserById(userId);
  if (!user) throw new Error("Benutzer nicht gefunden");
  deleteAvatarFile(user.avatar_path);
  return setUserAvatar(userId, {
    avatarPath: null,
    avatarPrompt: null,
  });
}
