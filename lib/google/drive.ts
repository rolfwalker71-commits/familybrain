import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  getAuthedGoogleClient,
  hasGoogleDriveScope,
} from "@/lib/google/oauth";

export { hasGoogleDriveScope };

const BUDDY_ROOT_FOLDER_NAME = "BUDDY";
const DRIVE_ROOT_FOLDER_ID_KEY = "google_drive_buddy_root_folder_id";

function sanitizePathSegment(raw: string, fallback: string): string {
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function driveFileWebUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

async function getDrive(
  userId: number,
  request?: Request | null
): Promise<drive_v3.Drive> {
  if (!hasGoogleDriveScope(userId)) {
    throw new Error(
      "Google Drive-Recht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const auth = await getAuthedGoogleClient(userId, request);
  return google.drive({ version: "v3", auth });
}

async function findChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string
): Promise<string | null> {
  const q = [
    `'${parentId}' in parents`,
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");
  const res = await drive.files.list({
    q,
    spaces: "drive",
    fields: "files(id,name)",
    pageSize: 5,
  });
  return res.data.files?.[0]?.id || null;
}

async function ensureChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await findChildFolder(drive, parentId, name);
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  const id = created.data.id;
  if (!id) throw new Error(`Drive-Ordner «${name}» konnte nicht angelegt werden.`);
  return id;
}

/** Ensure app folder BUDDY exists (cached in settings). */
export async function ensureBuddyDriveRootFolder(
  userId: number,
  request?: Request | null
): Promise<string> {
  const cached = getSetting(DRIVE_ROOT_FOLDER_ID_KEY)?.trim();
  const drive = await getDrive(userId, request);
  if (cached) {
    try {
      const meta = await drive.files.get({
        fileId: cached,
        fields: "id,trashed",
      });
      if (meta.data.id && !meta.data.trashed) return meta.data.id;
    } catch {
      /* recreate */
    }
  }

  const listed = await drive.files.list({
    q: [
      "mimeType = 'application/vnd.google-apps.folder'",
      `name = '${BUDDY_ROOT_FOLDER_NAME}'`,
      "trashed = false",
      "'root' in parents",
    ].join(" and "),
    spaces: "drive",
    fields: "files(id,name)",
    pageSize: 5,
  });
  let rootId = listed.data.files?.[0]?.id || null;
  if (!rootId) {
    const created = await drive.files.create({
      requestBody: {
        name: BUDDY_ROOT_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    rootId = created.data.id || null;
  }
  if (!rootId) throw new Error("Drive-Ordner BUDDY fehlt.");
  setSetting(DRIVE_ROOT_FOLDER_ID_KEY, rootId);
  return rootId;
}

export async function ensureBuddyDrivePath(
  userId: number,
  parts: string[],
  request?: Request | null
): Promise<string> {
  const drive = await getDrive(userId, request);
  let parent = await ensureBuddyDriveRootFolder(userId, request);
  for (const part of parts) {
    const name = sanitizePathSegment(part, "Sonstiges");
    parent = await ensureChildFolder(drive, parent, name);
  }
  return parent;
}

export async function uploadBuddyDrivePdf(input: {
  userId: number;
  parentFolderId: string;
  fileName: string;
  buffer: Buffer;
  request?: Request | null;
}): Promise<{ fileId: string; webViewLink: string }> {
  const drive = await getDrive(input.userId, input.request);
  const name = sanitizePathSegment(input.fileName.replace(/\.pdf$/i, ""), "dokument") + ".pdf";
  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [input.parentFolderId],
      mimeType: "application/pdf",
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(input.buffer),
    },
    fields: "id,webViewLink",
  });
  const fileId = res.data.id;
  if (!fileId) throw new Error("Drive-Upload fehlgeschlagen.");
  return {
    fileId,
    webViewLink: res.data.webViewLink || driveFileWebUrl(fileId),
  };
}

export { BUDDY_ROOT_FOLDER_NAME, DRIVE_ROOT_FOLDER_ID_KEY, sanitizePathSegment };
