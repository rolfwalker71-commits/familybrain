import type { MariListMetaField } from "@/lib/mari/ticket-filter-prefs-shared";

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

export type MariTicketListMetaItem = {
  id: MariListMetaField;
  value: string;
  kind: "customer" | "text";
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

/** Structured meta items for the ticket list row (Kunde as chip). */
export function buildMariTicketListMetaItems(
  t: MariTicketListMetaSource,
  fields: readonly MariListMetaField[]
): MariTicketListMetaItem[] {
  const items: MariTicketListMetaItem[] = [];
  const hasKunde = fields.includes("kunde");
  for (const id of fields) {
    let value: string | null = null;
    let kind: MariTicketListMetaItem["kind"] = "text";
    switch (id) {
      case "kunde":
        value = (t.addressMatchcode || t.cardCode || "").trim() || null;
        kind = "customer";
        break;
      case "projekt": {
        const pn = (t.projectNumber || "").trim();
        if (!pn) break;
        // Kunde already as chip — show only project number here.
        value = pn;
        break;
      }
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
    if (value) items.push({ id, value, kind });
  }
  // If projekt enabled but kunde not: still prefer customer chip + number when known
  if (!hasKunde) {
    const pn = (t.projectNumber || "").trim();
    const customer = (t.addressMatchcode || t.cardCode || "").trim();
    const projektIdx = items.findIndex((i) => i.id === "projekt");
    if (projektIdx >= 0 && pn && customer && customer !== pn) {
      items.splice(
        projektIdx,
        1,
        { id: "kunde", value: customer, kind: "customer" },
        { id: "projekt", value: pn, kind: "text" }
      );
    }
  }
  return items;
}

/** @deprecated Prefer buildMariTicketListMetaItems for UI. */
export function buildMariTicketListMetaParts(
  t: MariTicketListMetaSource,
  fields: readonly MariListMetaField[]
): string[] {
  return buildMariTicketListMetaItems(t, fields).map((i) =>
    i.kind === "customer" ? i.value : i.value
  );
}
