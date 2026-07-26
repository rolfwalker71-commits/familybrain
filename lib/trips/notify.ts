import fs from "fs";
import { getDb } from "@/lib/db/client";
import {
  isEmailConfigured,
  sendMail,
  type MailAttachment,
} from "@/lib/finance-brain/email";
import { loadScaledJpeg } from "@/lib/finance-brain/image-scale";
import { buildTravelDiaryPdfBuffer } from "@/lib/finance-brain/receipt-pdf";
import {
  buildTravelDiaryMailHtml,
  buildTripEventCommentMailHtml,
} from "@/lib/trips/mail-templates";
import {
  getTripById,
  getTripEventById,
  getTripEventCommentById,
  listTripTravelers,
} from "@/lib/trips/queries";
import {
  buildTravelDiaryModel,
  listTravelDiaryRecipients,
} from "@/lib/trips/travel-diary";
import { listExpenseShareDisplays } from "@/lib/finance-brain/queries";
import { getAppUserById } from "@/lib/users/queries";

export type NotifyResult = {
  ok: boolean;
  sent: number;
  skipped?: string;
  error?: string;
};

/** True when mail was attempted and failed (not merely skipped / unconfigured). */
export function notifyFailed(result: NotifyResult): boolean {
  return !result.ok && Boolean(result.error);
}

/** Unique participant emails: travelers + linked users + trip-access users. */
export function listTripParticipantEmails(tripId: number): string[] {
  const byLower = new Map<string, string>();

  function add(raw: string | null | undefined) {
    const trimmed = raw?.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    const key = trimmed.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, trimmed);
  }

  for (const traveler of listTripTravelers(tripId)) {
    add(traveler.email);
    if (traveler.user_id != null) {
      const user = getAppUserById(traveler.user_id);
      if (user?.active) add(user.email);
    }
  }

  const accessRows = getDb()
    .prepare(
      `SELECT u.email AS email
       FROM users u
       INNER JOIN user_trip_access uta ON uta.user_id = u.id
       WHERE uta.trip_id = ?
         AND u.active = 1
         AND TRIM(COALESCE(u.email, '')) != ''`
    )
    .all(tripId) as Array<{ email: string }>;
  for (const row of accessRows) add(row.email);

  return [...byLower.values()];
}

function eventLocationLabel(
  event: NonNullable<ReturnType<typeof getTripEventById>>
): string | null {
  const parts = [
    event.place_name,
    event.location,
    event.origin_place && event.destination_place
      ? `${event.origin_place} → ${event.destination_place}`
      : event.origin_place || event.destination_place,
  ]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.some((u) => u.toLowerCase() === p.toLowerCase())) {
      unique.push(p);
    }
  }
  return unique[0] ?? null;
}

/** Send diary comment mail to all trip participants with an email address. */
export async function notifyTripEventComment(
  commentId: number
): Promise<NotifyResult> {
  if (!isEmailConfigured()) {
    return { ok: true, sent: 0, skipped: "E-Mail nicht konfiguriert" };
  }

  const comment = getTripEventCommentById(commentId);
  if (!comment) {
    return { ok: false, sent: 0, error: "Kommentar nicht gefunden" };
  }
  const event = getTripEventById(comment.trip_event_id);
  if (!event) {
    return { ok: false, sent: 0, error: "Ereignis nicht gefunden" };
  }
  const trip = getTripById(event.trip_id);
  if (!trip) {
    return { ok: false, sent: 0, error: "Reise nicht gefunden" };
  }

  const recipients = listTripParticipantEmails(trip.id);
  if (recipients.length === 0) {
    return { ok: true, sent: 0, skipped: "keine Empfänger mit E-Mail" };
  }

  const hasAiImage = Boolean(
    event.ai_image_path && fs.existsSync(event.ai_image_path)
  );
  const hasCommentImage = Boolean(
    comment.image_path && fs.existsSync(comment.image_path)
  );
  const authorUser =
    comment.user_id != null ? getAppUserById(comment.user_id) : null;
  const authorAvatarPath =
    authorUser?.avatar_path && fs.existsSync(authorUser.avatar_path)
      ? authorUser.avatar_path
      : null;
  const authorAvatarCid = authorAvatarPath
    ? `avatar-user-${comment.user_id}`
    : undefined;

  const mail = buildTripEventCommentMailHtml({
    tripTitle: trip.title,
    eventTitle: event.title?.trim() || "Aktivität",
    eventType: event.event_type?.trim() || "Aktivität",
    startDate: event.start_date,
    endDate: event.end_date,
    startTime: event.start_time,
    endTime: event.end_time,
    location: eventLocationLabel(event),
    provider: event.provider,
    hasAiImage,
    aiCid: "event-ai",
    authorName: comment.author_name,
    authorAvatarCid,
    commentBody: comment.body,
    hasCommentImage,
    commentImageCid: "comment-image",
  });

  const attachments: MailAttachment[] = [];
  if (hasAiImage && event.ai_image_path) {
    const scaled = await loadScaledJpeg(event.ai_image_path, 144);
    if (scaled) {
      attachments.push({
        filename: `event-${event.id}-ai.jpg`,
        content: scaled.toString("base64"),
        content_id: "event-ai",
      });
    } else {
      attachments.push({
        filename: `event-${event.id}-ai.png`,
        content: fs.readFileSync(event.ai_image_path).toString("base64"),
        content_id: "event-ai",
      });
    }
  }
  if (hasCommentImage && comment.image_path) {
    const scaled = await loadScaledJpeg(comment.image_path, 640);
    if (scaled) {
      attachments.push({
        filename: `comment-${comment.id}.jpg`,
        content: scaled.toString("base64"),
        content_id: "comment-image",
      });
    } else {
      attachments.push({
        filename: `comment-${comment.id}.jpg`,
        content: fs.readFileSync(comment.image_path).toString("base64"),
        content_id: "comment-image",
      });
    }
  }
  if (authorAvatarCid && authorAvatarPath) {
    const scaled = await loadScaledJpeg(authorAvatarPath, 64);
    if (scaled) {
      attachments.push({
        filename: `${authorAvatarCid}.jpg`,
        content: scaled.toString("base64"),
        content_id: authorAvatarCid,
      });
    }
  }

  const result = await sendMail({
    to: recipients,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: attachments.length ? attachments : undefined,
  });
  if (!result.ok) {
    return { ok: false, sent: 0, error: result.error };
  }
  return { ok: true, sent: recipients.length };
}

/** Selective travel diary mail (timeline + comments + expenses + PDF). */
export async function notifyTravelDiary(
  tripId: number,
  recipientKeys: string[]
): Promise<NotifyResult> {
  if (!isEmailConfigured()) {
    return { ok: false, sent: 0, error: "E-Mail nicht konfiguriert" };
  }
  if (!getTripById(tripId)) {
    return { ok: false, sent: 0, error: "Reise nicht gefunden" };
  }

  const allowed = listTravelDiaryRecipients(tripId);
  if (allowed.length === 0) {
    return { ok: false, sent: 0, error: "Keine Empfänger mit E-Mail-Adresse" };
  }

  const keySet = new Set(recipientKeys);
  const recipients = allowed.filter((r) => keySet.has(r.recipientKey));
  if (recipients.length === 0) {
    return { ok: false, sent: 0, error: "Keine gültigen Empfänger ausgewählt" };
  }

  let model;
  try {
    model = buildTravelDiaryModel(tripId);
  } catch (err) {
    return {
      ok: false,
      sent: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (model.events.length === 0 && model.orphanExpenses.length === 0) {
    return { ok: false, sent: 0, error: "Keine Einträge fürs Reisetagebuch" };
  }

  const mail = buildTravelDiaryMailHtml(model);
  const pdf = await buildTravelDiaryPdfBuffer(model);

  const attachments: MailAttachment[] = [
    {
      filename: `travelbuddy-reisetagebuch-${tripId}.pdf`,
      content: pdf.toString("base64"),
    },
  ];

  for (const event of model.events) {
    if (event.aiImagePath) {
      const scaled = await loadScaledJpeg(event.aiImagePath, 144);
      if (scaled) {
        attachments.push({
          filename: `event-${event.eventId}-ai.jpg`,
          content: scaled.toString("base64"),
          content_id: event.aiCid,
        });
      }
    }
    for (const comment of event.comments) {
      if (!comment.imagePath) continue;
      const scaled = await loadScaledJpeg(comment.imagePath, 480);
      if (scaled) {
        attachments.push({
          filename: `comment-${comment.commentId}.jpg`,
          content: scaled.toString("base64"),
          content_id: comment.imageCid,
        });
      }
    }
    for (const expense of event.expenses) {
      if (!expense.aiImagePath) continue;
      const scaled = await loadScaledJpeg(expense.aiImagePath);
      if (scaled) {
        attachments.push({
          filename: `expense-${expense.expenseId}-ai.jpg`,
          content: scaled.toString("base64"),
          content_id: expense.aiCid || `expense-ai-${expense.expenseId}`,
        });
      }
    }
  }
  for (const expense of model.orphanExpenses) {
    if (!expense.aiImagePath) continue;
    const scaled = await loadScaledJpeg(expense.aiImagePath);
    if (scaled) {
      attachments.push({
        filename: `expense-${expense.expenseId}-ai.jpg`,
        content: scaled.toString("base64"),
        content_id: expense.aiCid || `expense-ai-${expense.expenseId}`,
      });
    }
  }

  const avatarPaths = new Map<string, string>();
  const allDiaryExpenses = [
    ...model.events.flatMap((e) => e.expenses),
    ...model.orphanExpenses,
  ];
  for (const expense of allDiaryExpenses) {
    for (const share of listExpenseShareDisplays(expense.expenseId, 0)) {
      if (share.avatarPath) {
        avatarPaths.set(`avatar-${share.memberId}`, share.avatarPath);
      }
    }
  }
  for (const event of model.events) {
    for (const comment of event.comments) {
      if (comment.avatarCid && comment.avatarPath) {
        avatarPaths.set(comment.avatarCid, comment.avatarPath);
      }
    }
  }
  for (const [cid, filePath] of avatarPaths) {
    const scaled = await loadScaledJpeg(filePath, 64);
    if (!scaled) continue;
    attachments.push({
      filename: `${cid}.jpg`,
      content: scaled.toString("base64"),
      content_id: cid,
    });
  }

  const result = await sendMail({
    to: recipients.map((r) => r.email),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments,
  });
  if (!result.ok) {
    return { ok: false, sent: 0, error: result.error };
  }
  return { ok: true, sent: recipients.length };
}
