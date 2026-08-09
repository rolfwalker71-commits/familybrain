/**
 * Sofort-Feedback für User-Aktionen (Erledigen, Terminieren, …).
 * Zeigt Inline-Listener und den globalen Toast (RealtimeToasts).
 */

export type ActionFeedbackTone = "success" | "error" | "info";

export type ActionFeedbackDetail = {
  headline: string;
  detail?: string | null;
  tone?: ActionFeedbackTone;
};

export const BUDDY_ACTION_FEEDBACK_EVENT = "buddy:action-feedback";

export function showActionFeedback(input: ActionFeedbackDetail): void {
  if (typeof window === "undefined") return;
  const detail: ActionFeedbackDetail = {
    headline: input.headline.trim(),
    detail: input.detail?.trim() || null,
    tone: input.tone || "success",
  };
  if (!detail.headline) return;
  window.dispatchEvent(
    new CustomEvent(BUDDY_ACTION_FEEDBACK_EVENT, { detail })
  );
}
