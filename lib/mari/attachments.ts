import { MariApiError, mariFetch, mariJson, mariSql } from "@/lib/mari/client";

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

function decodeMariBase64(raw: string): Buffer | null {
  let s = raw.replace(/\s/g, "");
  if (!s) return null;
  // data:-URL aus manchen Exporten
  const dataUrl = /^data:[^;]+;base64,(.+)$/i.exec(s);
  if (dataUrl?.[1]) s = dataUrl[1].replace(/\s/g, "");
  try {
    const buf = Buffer.from(s, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

function sniffImageMime(bytes: Buffer, fallback: string): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return fallback.startsWith("image/") ? fallback : fallback || "application/octet-stream";
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
  const bytes = decodeMariBase64(raw);
  if (!bytes) return null;
  if (bytes.length > maxBytes) return null;
  const orgFilename = (full.OrgFilename || `anhang-${attachmentId}`).trim();
  const mimeType = sniffImageMime(
    bytes,
    normalizeMariMime(full.MimeType, orgFilename)
  );
  return {
    attachmentId: Number(full.AttachmentID) || attachmentId,
    issueId: Number(full.IssueID) || 0,
    mimeType,
    orgFilename,
    bytes,
    byteLength: bytes.length,
  };
}

/**
 * Löscht einen SupportIssueAttachment (Notiz oder Datei) in MARI.
 * Für interne Buddy-Notizen: AttachmentTyp 1, ohne Datei.
 */
export async function deleteMariSupportAttachment(
  attachmentId: number
): Promise<void> {
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    throw new MariApiError("Anhang-ID ungültig.", 400);
  }
  const res = await mariFetch(`/api/SupportIssueAttachment/${attachmentId}`, {
    method: "DELETE",
  });
  const text = (await res.text()).trim();
  if (res.ok) return;
  let detail = "";
  if (text) {
    try {
      const parsed = JSON.parse(text) as { Message?: string };
      detail = String(parsed.Message || "").trim();
    } catch {
      detail = text.slice(0, 300);
    }
  }
  if (!detail || /^an error has occurred\.?$/i.test(detail)) {
    detail = `Löschen in MARI fehlgeschlagen (HTTP ${res.status}).`;
  }
  throw new MariApiError(detail, res.status || 502, text || null);
}

/**
 * Löscht nur interne Notizen (ohne Datei) eines Tickets.
 * Prüft Zugehörigkeit zum Issue und Internal/Notiz-Charakter.
 */
export async function deleteMariInternalNote(params: {
  issueId: number;
  attachmentId: number;
}): Promise<{ attachmentId: number; subject: string | null }> {
  const { issueId, attachmentId } = params;
  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new MariApiError("Ungültige Ticket-ID", 400);
  }
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    throw new MariApiError("Ungültige Notiz-ID", 400);
  }

  const [attachments, lines] = await Promise.all([
    listMariAttachments(issueId),
    mariSql<{
      RequestPosID: number;
      RequestPosType: number;
      RequestPosSubject: string | null;
      VisibleInternOnly: number | null;
      IssueID: number;
    }>(
      `SELECT TOP 1
  "RequestPosID",
  "RequestPosType",
  "RequestPosSubject",
  "VisibleInternOnly",
  "IssueID"
FROM "MARISupportIssueLine"
WHERE "IssueID" = ${issueId}
  AND "RequestPosID" = ${attachmentId}`
    ),
  ]);

  const line = lines[0];
  if (!line) {
    throw new MariApiError(
      "Interner Kommentar nicht gefunden (oder gehört nicht zu diesem Ticket).",
      404
    );
  }
  const internalOnly =
    line.VisibleInternOnly != null && Number(line.VisibleInternOnly) !== 0;
  if (!internalOnly) {
    throw new MariApiError(
      "Nur interne Kommentare können hier gelöscht werden.",
      403
    );
  }

  const meta = attachments.find((a) => a.attachmentId === attachmentId);
  if (meta?.hasFile) {
    throw new MariApiError(
      "Dateianhänge können hier nicht gelöscht werden — nur interne Text-Notizen.",
      403
    );
  }
  const posType = Number(line.RequestPosType);
  const isNoteType =
    posType === 5 ||
    meta?.attachmentTyp === 1 ||
    (meta != null && !meta.hasFile) ||
    meta == null;
  if (!isNoteType) {
    throw new MariApiError(
      "Dieser Verlaufseintrag ist keine löschbare interne Notiz.",
      403
    );
  }

  await deleteMariSupportAttachment(attachmentId);
  return {
    attachmentId,
    subject: line.RequestPosSubject?.trim() || null,
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
      const bytes = decodeMariBase64(raw);
      if (!bytes) continue;
      const byteLength = bytes.length;
      // Skip tiny signature GIFs / icons
      const mime = sniffImageMime(
        bytes,
        normalizeMariMime(
          full.MimeType || item.mimeType,
          full.OrgFilename || item.orgFilename
        )
      );
      if (mime === "image/gif" && byteLength < 12_000) continue;
      if (byteLength < 2_500) continue;
      if (byteLength > maxBytesPerImage) continue;
      if (total + byteLength > maxTotalBytes) continue;
      if (!mime.startsWith("image/")) continue;

      const base64 = bytes.toString("base64");
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
