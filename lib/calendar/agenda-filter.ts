/** Client-safe agenda source filter (no Node/DB imports). */

export function filterAgendaItemsBySources<
  T extends { calendarId?: string | null },
>(items: T[], selected: Set<string> | null): T[] {
  if (selected == null) return items;
  return items.filter(
    (item) => !item.calendarId || selected.has(item.calendarId)
  );
}
