import type { MariListMetaField } from "@/lib/mari/ticket-filter-prefs";

/** Minimal ticket shape for list meta lines (list + detail). */
export type MariTicketListMetaSource = {
  briefDescription?: string | null;
  cardCode?: string | null;
  addressMatchcode?: string | null;
  projectNumber?: string | null;
  contractNumber?: string | null;
  contractId?: number | null;
  requestDate?: string | null;
  changeAtDate?: string | null;
};

function formatDayMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
}

function contractLabel(t: MariTicketListMetaSource): string | null {
  const num = (t.contractNumber || "").trim();
  if (num) return num;
  if (t.contractId != null && Number.isFinite(t.contractId)) {
    return `V-${t.contractId}`;
  }
  return null;
}

function activityLabel(t: MariTicketListMetaSource): string | null {
  const raw = (t.briefDescription || "").trim();
  if (!raw) return null;
  return raw.length > 48 ? `${raw.slice(0, 47)}…` : raw;
}

/** Build meta parts for the ticket list row according to user prefs. */
export function buildMariTicketListMetaParts(
  t: MariTicketListMetaSource,
  fields: readonly MariListMetaField[]
): string[] {
  const parts: string[] = [];
  for (const id of fields) {
    let value: string | null = null;
    switch (id) {
      case "kunde":
        value = (t.addressMatchcode || t.cardCode || "").trim() || null;
        break;
      case "projekt":
        value = (t.projectNumber || "").trim() || null;
        break;
      case "vertrag":
        value = contractLabel(t);
        break;
      case "aktivitaet":
        value = activityLabel(t);
        break;
      case "seit": {
        const d = formatDayMonth(t.requestDate);
        value = d ? `seit ${d}` : null;
        break;
      }
      case "geaendert": {
        const d = formatDayMonth(t.changeAtDate);
        value = d ? `änd. ${d}` : null;
        break;
      }
      default:
        break;
    }
    if (value) parts.push(value);
  }
  return parts;
}
