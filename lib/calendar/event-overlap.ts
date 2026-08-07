/** Pure overlap helpers for agenda / mail apply conflict checks. */

export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function timedWindowMinutes(input: {
  time?: string | null;
  endTime?: string | null;
}): { start: number; end: number } | null {
  if (!input.time) return null;
  const start = hmToMinutes(input.time);
  if (start == null) return null;
  const end = input.endTime ? hmToMinutes(input.endTime) : null;
  return { start, end: end != null && end > start ? end : start + 60 };
}

export type OverlapSlot = {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string | null;
  planningRelevant?: boolean | null;
};

export function findTimedOverlaps(
  slots: OverlapSlot[],
  date: string
): Array<{ id: string; label: string }> {
  const timed = slots.filter(
    (i) => i.date === date && i.time && i.planningRelevant !== false
  );
  const out: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < timed.length; i += 1) {
    const a = timed[i]!;
    const wa = timedWindowMinutes({ time: a.time, endTime: a.endTime });
    if (!wa) continue;
    for (let j = i + 1; j < timed.length; j += 1) {
      const b = timed[j]!;
      const wb = timedWindowMinutes({ time: b.time, endTime: b.endTime });
      if (!wb) continue;
      if (wa.start < wb.end && wb.start < wa.end) {
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: key,
          label: `${a.time} ${a.title} ↔ ${b.time} ${b.title}`,
        });
      }
    }
  }
  return out;
}

/** Does proposed window overlap any existing slot on the same date? */
export function findConflictsAgainstProposed(
  existing: OverlapSlot[],
  proposed: {
    id: string;
    title: string;
    date: string;
    time: string;
    endTime?: string | null;
  }
): Array<{ id: string; label: string }> {
  const pw = timedWindowMinutes({
    time: proposed.time,
    endTime: proposed.endTime,
  });
  if (!pw) return [];
  const out: Array<{ id: string; label: string }> = [];
  for (const slot of existing) {
    if (slot.date !== proposed.date) continue;
    if (slot.planningRelevant === false) continue;
    const sw = timedWindowMinutes({ time: slot.time, endTime: slot.endTime });
    if (!sw) continue;
    if (pw.start < sw.end && sw.start < pw.end) {
      out.push({
        id: `${proposed.id}|${slot.id}`,
        label: `${proposed.time} ${proposed.title} ↔ ${slot.time} ${slot.title}`,
      });
    }
  }
  return out;
}
