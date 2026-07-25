import path from "path";
import type { AuthContext } from "@/lib/auth/current-user";
import { getAppUserById } from "@/lib/users/queries";
import { tripEventCommentImagePublicUrl } from "@/lib/trips/comment-images";
import type { TripEventCommentRow } from "@/lib/trips/queries";

export const MAX_COMMENT_BODY = 2000;
export const MAX_COMMENT_IMAGE_BYTES = 8 * 1024 * 1024;

export type SerializedTripEventComment = {
  id: number;
  trip_event_id: number;
  user_id: number | null;
  author_name: string;
  body: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
};

export function authorNameFromAuth(auth: AuthContext): string {
  if (auth.isAdmin) return auth.username;
  if (auth.userId) {
    const user = getAppUserById(auth.userId);
    return user?.display_name?.trim() || user?.username || auth.username;
  }
  return auth.username;
}

export function canEditComment(
  row: TripEventCommentRow,
  auth: AuthContext | null
): boolean {
  if (!auth) return false;
  if (auth.isAdmin) return true;
  return (
    auth.userId != null &&
    row.user_id != null &&
    auth.userId === row.user_id
  );
}

export function serializeTripEventComment(
  row: TripEventCommentRow,
  auth: AuthContext | null,
  options?: { shareToken?: string }
): SerializedTripEventComment {
  let imageUrl: string | null = null;
  if (row.image_path) {
    if (options?.shareToken) {
      imageUrl = `/api/share/t/${encodeURIComponent(options.shareToken)}/media/comment/${encodeURIComponent(
        path.basename(row.image_path)
      )}`;
    } else {
      imageUrl = tripEventCommentImagePublicUrl(row.image_path);
    }
  }
  return {
    id: row.id,
    trip_event_id: row.trip_event_id,
    user_id: row.user_id,
    author_name: row.author_name,
    body: row.body,
    image_url: imageUrl,
    created_at: row.created_at,
    updated_at: row.updated_at,
    can_edit: canEditComment(row, auth),
  };
}
