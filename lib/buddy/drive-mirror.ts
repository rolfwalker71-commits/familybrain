import { getSetting, setSetting } from "@/lib/db/migrations";
import { getDocumentById, getPaperlessSettings } from "@/lib/db/queries";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import {
  hasGoogleDriveScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import {
  ensureBuddyDrivePath,
  uploadBuddyDrivePdf,
  BUDDY_ROOT_FOLDER_NAME,
} from "@/lib/google/drive";
import { PaperlessClient } from "@/lib/paperless/client";
import {
  countDocumentsMissingDriveMirror,
  countDocumentsWithDriveMirror,
  countPaperlessDocuments,
  findDriveMirrorForDocument,
  upsertBuddySourceLink,
} from "@/lib/buddy/source-links";

export const DRIVE_MIRROR_ENABLED_KEY = "buddy_drive_mirror_enabled";
export const DRIVE_MIRROR_LAST_ERROR_KEY = "buddy_drive_mirror_last_error";
export const DRIVE_MIRROR_LAST_RUN_KEY = "buddy_drive_mirror_last_run_at";

export function isDriveMirrorEnabled(): boolean {
  const v = getSetting(DRIVE_MIRROR_ENABLED_KEY);
  if (v == null || v === "") return true;
  return v === "1" || v.toLowerCase() === "true";
}

export function setDriveMirrorEnabled(enabled: boolean): void {
  setSetting(DRIVE_MIRROR_ENABLED_KEY, enabled ? "1" : "0");
}

export function resolveDriveMirrorUserId(): number | null {
  const rolf = findRolfAppUserId();
  if (rolf != null && isGoogleMailConnected(rolf) && hasGoogleDriveScope(rolf)) {
    return rolf;
  }
  return rolf != null && isGoogleMailConnected(rolf) ? rolf : null;
}

function yearFromDoc(createdDate: string | null | undefined): string {
  const y = (createdDate || "").slice(0, 4);
  if (/^\d{4}$/.test(y)) return y;
  return String(new Date().getFullYear());
}

export type DriveMirrorStatus = {
  enabled: boolean;
  hasDriveScope: boolean;
  connected: boolean;
  userId: number | null;
  rootFolderName: typeof BUDDY_ROOT_FOLDER_NAME;
  totalDocuments: number;
  mirrored: number;
  pending: number;
  percent: number;
  complete: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

export function getDriveMirrorStatus(): DriveMirrorStatus {
  const userId = findRolfAppUserId();
  const connected = isGoogleMailConnected(userId);
  const hasDriveScope = hasGoogleDriveScope(userId);
  const total = countPaperlessDocuments();
  const mirrored = countDocumentsWithDriveMirror();
  const pending = countDocumentsMissingDriveMirror();
  const percent =
    total === 0 ? 100 : Math.min(100, Math.round((mirrored / total) * 100));
  return {
    enabled: isDriveMirrorEnabled(),
    hasDriveScope,
    connected,
    userId,
    rootFolderName: BUDDY_ROOT_FOLDER_NAME,
    totalDocuments: total,
    mirrored,
    pending,
    percent,
    complete: total > 0 ? pending === 0 : true,
    lastRunAt: getSetting(DRIVE_MIRROR_LAST_RUN_KEY),
    lastError: getSetting(DRIVE_MIRROR_LAST_ERROR_KEY),
  };
}

/** Ensure Paperless primary link + upload PDF mirror to Drive. */
export async function mirrorDocumentToDrive(
  documentId: number,
  options?: { userId?: number; request?: Request | null; force?: boolean }
): Promise<{ ok: boolean; skipped?: string; fileId?: string; url?: string }> {
  if (!isDriveMirrorEnabled() && !options?.force) {
    return { ok: false, skipped: "disabled" };
  }
  const userId = options?.userId ?? resolveDriveMirrorUserId();
  if (userId == null) return { ok: false, skipped: "no-user" };
  if (!hasGoogleDriveScope(userId)) {
    return { ok: false, skipped: "drive.file fehlt — neu verbinden" };
  }

  const pack = getDocumentById(documentId);
  const doc = pack?.document;
  if (!doc) return { ok: false, skipped: "dokument fehlt" };

  upsertBuddySourceLink({
    entityType: "document",
    entityId: doc.id,
    sourceKind: "paperless",
    sourceId: String(doc.paperless_id),
    url: doc.paperless_url || null,
    label: "Paperless",
    role: "primary",
  });

  const existing = findDriveMirrorForDocument(doc.id);
  if (existing && !options?.force) {
    return {
      ok: true,
      skipped: "already",
      fileId: existing.sourceId,
      url: existing.url || undefined,
    };
  }

  const { baseUrl, apiToken } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    return { ok: false, skipped: "paperless nicht konfiguriert" };
  }

  const client = new PaperlessClient(baseUrl, apiToken);
  const { buffer, contentType } = await client.downloadDocument(
    doc.paperless_id,
    false
  );
  if (!contentType.includes("pdf") && buffer.byteLength < 100) {
    return { ok: false, skipped: "kein PDF" };
  }

  const year = yearFromDoc(doc.created_date);
  const rubrik =
    doc.document_type_name?.trim() ||
    "Sonstiges";
  const parentId = await ensureBuddyDrivePath(
    userId,
    [year, rubrik],
    options?.request
  );
  const fileName = `${doc.paperless_id}-${doc.title || "dokument"}`;
  const uploaded = await uploadBuddyDrivePdf({
    userId,
    parentFolderId: parentId,
    fileName,
    buffer: Buffer.from(buffer),
    request: options?.request,
  });

  upsertBuddySourceLink({
    entityType: "document",
    entityId: doc.id,
    sourceKind: "drive_file",
    sourceId: uploaded.fileId,
    url: uploaded.webViewLink,
    label: "Google Drive",
    role: "mirror",
  });

  return { ok: true, fileId: uploaded.fileId, url: uploaded.webViewLink };
}
