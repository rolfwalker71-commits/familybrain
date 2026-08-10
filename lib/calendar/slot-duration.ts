/** Shared duration presets for Ad-hoc create and reschedule slot search. */
export const SLOT_DURATION_PRESETS = [15, 30, 45, 60, 90] as const;

export type SlotDurationPreset = (typeof SLOT_DURATION_PRESETS)[number];

export function isSlotDurationPreset(
  n: number
): n is SlotDurationPreset {
  return (SLOT_DURATION_PRESETS as readonly number[]).includes(n);
}
