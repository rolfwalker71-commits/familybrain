/** Shared duration presets for Ad-hoc create and reschedule slot search. */
export const SLOT_DURATION_PRESETS = [15, 30, 45, 60, 90] as const;

export type SlotDurationPreset = (typeof SLOT_DURATION_PRESETS)[number];

export function isSlotDurationPreset(
  n: number
): n is SlotDurationPreset {
  return (SLOT_DURATION_PRESETS as readonly number[]).includes(n);
}

/** Minutes between HH:MM start/end; fallback 60. */
export function durationMinutesFromHm(
  startHm: string | null | undefined,
  endHm: string | null | undefined,
  fallback = 60
): number {
  if (!startHm || !endHm) return fallback;
  const [sh, sm] = startHm.split(":").map(Number);
  const [eh, em] = endHm.split(":").map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return fallback;
  let mins = eh! * 60 + em! - (sh! * 60 + sm!);
  if (mins <= 0) mins += 24 * 60;
  return Math.max(15, mins);
}
