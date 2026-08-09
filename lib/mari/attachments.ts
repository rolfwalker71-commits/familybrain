import { mariJson } from "@/lib/mari/client";

export type MariAttachmentMeta = {
  attachmentId: number;
  issueId: number;
  mimeType: string;
  orgFilename: string;
  attachmentTyp: number | null;
  internal: boolean;
  /** True when OrgFilename / MimeType indicate a real file (not note-only). */
  hasFile: boolean;
};

export type MariImageAttachment = MariAttachmentMeta & {
  /** Raw base64 without data: prefix */
  base64: string;
  dataUrl: string;
  byteLength: number;
};

export type MariAttachmentPayload = {
  attachmentId: number;
  issueId: number;
  mimeType: string;
  orgFilename: string;
  bytes: Buffer;
  byteLength: number;
};

type MariAttachmentApiRow = {
  AttachmentID?: number;
  IssueID?: number;
  MimeType?: string | null;
  OrgFilename?: string | null;
  AttachmentTyp?: number | null;
  Internal?: boolean | null;
  DocumentData?: string | null;
};

const IMAGE_MIME = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function normalizeMariMime(
  raw: string | null | undefined,
  filename: string
): string {
  const m = (raw || "").trim().toLowerCase();
  if (m.startsWith("image/")) return m;
  if (m === "png" || m === "jpg" || m === "jpeg" || m === "webp" || m === "gif") {
    return m === "jpg" ? "image/jpeg" : `image/${m}`;
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "msg") return "application/vnd.ms-outlook";
  if (ext === "eml") return "message/rfc822";
  return m || "application/octet-stream";
}

export function isMariImageMime(mime: string, filename = ""): boolean {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return true;
  if (IMAGE_MIME.has(m)) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(filename);
}

function isImageAttachment(row: MariAttachmentApiRow): boolean {
  const name = (row.OrgFilename || "").toLowerCase();
  const mime = (row.MimeType || "").toLowerCase();
  if (IMAGE_MIME.has(mime)) return true;
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return true;
  return false;
}

function approxBytesFromBase64(b64: string): number {
  const len = b64.replace(/\s/g, "").length;
  return Math.floor((len * 3) / 4);
}

function rowHasFile(row: MariAttachmentApiRow): boolean {
  const name = (row.OrgFilename || "").trim();
  const mime = (row.MimeType || "").trim();
  return Boolean(name) || Boolean(mime);
}

/** Meta-Liste ohne Binärdaten. */
export async function listMariAttachments(
  issueId: number
): Promise<MariAttachmentMeta[]> {
  if (!Number.isInteger(issueId) || issueId <= 0) return [];
  const rows = await mariJson<MariAttachmentApiRow[] | { Message?: string }>(
    `/api/SupportIssueAttachmentList/${issueId}`
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      const attachmentId = Number(r.AttachmentID);
      if (!Number.isInteger(attachmentId) || attachmentId <= 0) return null;
      const orgFilename = (r.OrgFilename || "").trim();
      const hasFile = rowHasFile(r);
      return {
        attachmentId,
        issueId: Number(r.IssueID) || issueId,
        mimeType: normalizeMariMime(r.MimeType, orgFilename),
        orgFilename: orgFilename || `anhang-${attachmentId}`,
        attachmentTyp:
          r.AttachmentTyp == null ? null : Number(r.AttachmentTyp),
        internal: Boolean(r.Internal),
        hasFile,
      };
    })
    .filter((x): x is MariAttachmentMeta => x != null);
}

/** Binärdaten eines Anhangs (Base64 aus MARI → Buffer). */
export async function getMariAttachmentPayload(
  attachmentId: number,
  options?: { maxBytes?: number }
): Promise<MariAttachmentPayload | null> {
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) return null;
  const maxBytes = options?.maxBytes ?? 12_000_000;
  const full = await mariJson<MariAttachmentApiRow>(
    `/api/SupportIssueAttachment/${attachmentId}`
  );
  const raw = typeof full.DocumentData === "string" ? full.DocumentData : "";
  const base64 = raw.replace(/\s/g, "");
  if (!base64) return null;
  const byteLength = approxBytesFromBase64(base64);
  if (byteLength <= 0 || byteLength > maxBytes) return null;
  const orgFilename = (full.OrgFilename || `anhang-${attachmentId}`).trim();
  const mimeType = normalizeMariMime(full.MimeType, orgFilename);
  return {
    attachmentId: Number(full.AttachmentID) || attachmentId,
    issueId: Number(full.IssueID) || 0,
    mimeType,
    orgFilename,
    bytes: Buffer.from(base64, "base64"),
    byteLength,
  };
}

/**
 * Bild-Anhänge für AI-Vision laden.
 * Begrenzt Anzahl/Größe; winzige GIFs (Signaturen) werden übersprungen.
 */
export async function listMariImageAttachmentsForAi(
  issueId: number,
  options?: {
    maxImages?: number;
    maxBytesPerImage?: number;
    maxTotalBytes?: number;
  }
): Promise<MariImageAttachment[]> {
  const maxImages = Math.min(Math.max(options?.maxImages ?? 4, 1), 6);
  const maxBytesPerImage = options?.maxBytesPerImage ?? 1_800_000;
  const maxTotalBytes = options?.maxTotalBytes ?? 4_500_000;

  const meta = (await listMariAttachments(issueId)).filter(
    (a) => a.hasFile && a.mimeType.startsWith("image/")
  );
  if (meta.length === 0) return [];

  // Prefer customer/inbound-looking attachments; AttachmentTyp 3 oft Mail-Eingang
  const ranked = [...meta].sort((a, b) => {
    const score = (x: MariAttachmentMeta) =>
      (x.attachmentTyp === 3 ? 0 : 1) + (x.internal ? 2 : 0);
    return score(a) - score(b);
  });

  const out: MariImageAttachment[] = [];
  let total = 0;

  for (const item of ranked) {
    if (out.length >= maxImages) break;
    try {
      const full = await mariJson<MariAttachmentApiRow>(
        `/api/SupportIssueAttachment/${item.attachmentId}`
      );
      const raw = typeof full.DocumentData === "string" ? full.DocumentData : "";
      const base64 = raw.replace(/\s/g, "");
      if (!base64) continue;
      const byteLength = approxBytesFromBase64(base64);
      // Skip tiny signature GIFs / icons
      if (item.mimeType === "image/gif" && byteLength < 12_000) continue;
      if (byteLength < 2_500) continue;
      if (byteLength > maxBytesPerImage) continue;
      if (total + byteLength > maxTotalBytes) continue;

      const mime = normalizeMariMime(
        full.MimeType || item.mimeType,
        full.OrgFilename || item.orgFilename
      );
      if (!mime.startsWith("image/")) continue;

      out.push({
        attachmentId: item.attachmentId,
        issueId: item.issueId,
        mimeType: mime,
        orgFilename: (
          full.OrgFilename ||
          item.orgFilename ||
          `image-${item.attachmentId}`
        ).trim(),
        attachmentTyp: item.attachmentTyp,
        internal: item.internal,
        hasFile: true,
        base64,
        dataUrl: `data:${mime};base64,${base64}`,
        byteLength,
      });
      total += byteLength;
    } catch {
      /* skip broken attachment */
    }
  }

  return out;
}

/** Detect image-ish filenames in a meta list without download. */
export function countImageAttachmentMetas(
  metas: MariAttachmentMeta[]
): number {
  return metas.filter((a) => a.hasFile && a.mimeType.startsWith("image/"))
    .length;
}

export function isImageAttachmentRow(row: MariAttachmentApiRow): boolean {
  return isImageAttachment(row);
}
