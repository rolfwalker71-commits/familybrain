import type { MailAnalysis, MailSuggestion } from "@/lib/mail/mail-action-schema";

const CARRIERS: Array<{ re: RegExp; label: string }> = [
  { re: /\bups\b/i, label: "UPS" },
  { re: /\bdhl\b/i, label: "DHL" },
  { re: /\bfedex\b/i, label: "FedEx" },
  { re: /\bswiss\s*post\b|\bdie\s*post\b|\bpost\.ch\b|\bpostch\b/i, label: "Die Post" },
  { re: /\bgls\b/i, label: "GLS" },
  { re: /\bdpd\b/i, label: "DPD" },
  { re: /\bhermes\b/i, label: "Hermes" },
  { re: /\bplanzer\b/i, label: "Planzer" },
];

const GENERIC_EVENT_TITLE =
  /^(paketlieferung|lieferung|zustellung|paket|parcel\s*delivery|delivery)$/i;

/** Domains that are carriers / infra — not the shop. */
const SKIP_MERCHANT_HOST =
  /^(ups|dhl|fedex|usps|swisspost|post|gls|dpd|hermes|planzer|google|gmail|outlook|microsoft|amazon|aws|sendgrid|mailchimp|klaviyo|shopify|tracking|notify|mcinfo|info|noreply|no-reply)\b/i;

function detectCarrier(hay: string): string | null {
  for (const c of CARRIERS) {
    if (c.re.test(hay)) return c.label;
  }
  return null;
}

export { detectCarrier };

/**
 * Common tracking / shipment ids from mail text.
 */
export function detectTracking(hay: string): string | null {
  const ups = /\b(1Z[A-Z0-9]{16})\b/i.exec(hay);
  if (ups?.[1]) return ups[1].toUpperCase();

  const labeled =
    /(?:tracking(?:\s*(?:number|nr\.?|#|nummer))?|sendungs(?:nummer|nr\.?)|sendung(?:s)?(?:nummer|nr\.?)|trackingcode)\s*[:#]?\s*([A-Z0-9][A-Z0-9_-]{5,34})/i.exec(
      hay
    );
  if (labeled?.[1]) {
    const code = labeled[1].replace(/[.,;]+$/, "");
    if (code.length >= 6) return code.toUpperCase();
  }

  const dhl = /\b(\d{10,22})\b/.exec(hay);
  if (dhl?.[1] && /dhl/i.test(hay) && dhl[1].length >= 10) {
    return dhl[1];
  }

  return null;
}

/** Optional recipient hint («für Rolf», delivered to …). */
export function detectRecipientHint(hay: string): string | null {
  const fuer =
    /(?:\bfür\b|\bdelivered\s+to\b|\bempfänger\b|\brecipient\b)\s*[:\s]+([A-Za-zÄÖÜäöü][\wÄÖÜäöü.'-]{1,40})/i.exec(
      hay
    );
  if (fuer?.[1]) {
    const name = fuer[1].trim().replace(/[.,;:]+$/, "");
    if (
      name.length >= 2 &&
      !/^(you|sie|ihnen|package|paket|shipment|sendung)$/i.test(name) &&
      !/\.(ch|com|de|at|shop)$/i.test(name) &&
      !/\d{5,}/.test(name)
    ) {
      return name;
    }
  }
  // «for First Last» only when two capitalized words (avoid «for irugs.ch»)
  const forPerson =
    /\bfor\s+([A-ZÄÖÜ][a-zäöü]+(?:\s+[A-ZÄÖÜ][a-zäöü]+)+)\b/.exec(hay);
  if (forPerson?.[1]) {
    return forPerson[1].trim();
  }
  return null;
}

/**
 * Guess merchant/shop from mail text: irugs.ch, "from irugs", order for X, etc.
 */
export function detectMerchant(hay: string): string | null {
  const domains = hay.match(
    /\b([a-z0-9][a-z0-9-]{1,40})\.(ch|com|de|at|shop|store)\b/gi
  );
  if (domains) {
    for (const raw of domains) {
      const host = raw.toLowerCase();
      const name = host.split(".")[0] || "";
      if (!name || SKIP_MERCHANT_HOST.test(name) || SKIP_MERCHANT_HOST.test(host)) {
        continue;
      }
      return host;
    }
  }

  const soldBy =
    /(?:sold\s+by|verkauft\s+von|bestellung\s+bei|order\s+from|from\s+merchant|händler)\s*[:\s]+([A-Za-z0-9][\w.&' -]{1,40})/i.exec(
      hay
    );
  if (soldBy?.[1]) {
    const m = soldBy[1].trim().replace(/[.,;:]+$/, "");
    if (m.length >= 2 && !SKIP_MERCHANT_HOST.test(m)) return m;
  }

  return null;
}

function padHm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function to24h(hour: number, minute: number, ampm?: string | null): string {
  let h = hour;
  const ap = (ampm || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h <= 24) {
    /* already 24h-ish */
  }
  return padHm(Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, minute)));
}

export type DeliveryWindow = { startTime: string; endTime: string | null };

/**
 * Extract delivery / appointment time window from mail text.
 * Prefer ranges; fall back to a single clock time.
 */
export function detectDeliveryWindow(hay: string): DeliveryWindow | null {
  // 09:00-13:00 / 9:00 – 13:00 / 09:00 bis 13:00
  const colonRange =
    /(\d{1,2}):(\d{2})\s*(?:uhr)?\s*(?:–|-|—|bis|to)\s*(\d{1,2}):(\d{2})\s*(?:uhr)?/i.exec(
      hay
    );
  if (colonRange) {
    return {
      startTime: padHm(Number(colonRange[1]), Number(colonRange[2])),
      endTime: padHm(Number(colonRange[3]), Number(colonRange[4])),
    };
  }

  // between 9:00 AM and 1:00 PM / from 10am to 2pm
  const enRange =
    /(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s+(?:and|to|-|–)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i.exec(
      hay
    );
  if (enRange) {
    const startAp = (enRange[3] || enRange[6] || "").replace(/\./g, "");
    const endAp = (enRange[6] || "").replace(/\./g, "");
    return {
      startTime: to24h(
        Number(enRange[1]),
        Number(enRange[2] || 0),
        startAp || null
      ),
      endTime: to24h(Number(enRange[4]), Number(enRange[5] || 0), endAp || null),
    };
  }

  // von 9 bis 12 Uhr / zwischen 9 und 13 Uhr
  const deRange =
    /(?:zwischen|von)\s+(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\s*(?:und|bis|-|–)\s+(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?/i.exec(
      hay
    );
  if (deRange) {
    return {
      startTime: padHm(Number(deRange[1]), Number(deRange[2] || 0)),
      endTime: padHm(Number(deRange[3]), Number(deRange[4] || 0)),
    };
  }

  // 9-12 Uhr / 9–13h
  const shortDe =
    /\b(\d{1,2})\s*[–\-]\s*(\d{1,2})\s*(?:uhr|h)\b/i.exec(hay);
  if (shortDe) {
    const a = Number(shortDe[1]);
    const b = Number(shortDe[2]);
    if (a < 24 && b < 24 && b > a) {
      return { startTime: padHm(a, 0), endTime: padHm(b, 0) };
    }
  }

  // single: um 10:30 Uhr / at 10:00 AM / scheduled for 14:00
  const single =
    /(?:um|at|gegen|scheduled\s+for|delivery\s+by|zustellung\s+(?:um|gegen)?)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|uhr)?/i.exec(
      hay
    );
  if (single) {
    const ap = (single[3] || "").replace(/\./g, "").replace(/uhr/i, "");
    return {
      startTime: to24h(Number(single[1]), Number(single[2] || 0), ap || null),
      endTime: null,
    };
  }

  return null;
}

function enrichEventTitle(
  title: string,
  carrier: string | null,
  merchant: string | null,
  ctx?: { fromName: string; subject: string }
): string {
  let t = title.trim();
  const looksGeneric = GENERIC_EVENT_TITLE.test(t) || /^paket/i.test(t);

  if (carrier && merchant) {
    if (looksGeneric || !t.toLowerCase().includes(carrier.toLowerCase())) {
      return `${carrier} Paketlieferung - ${merchant}`.slice(0, 200);
    }
    if (
      !t
        .toLowerCase()
        .includes(merchant.toLowerCase().split(".")[0] || merchant)
    ) {
      return `${t} - ${merchant}`.slice(0, 200);
    }
  }
  if (carrier && looksGeneric) {
    return `${carrier} Paketlieferung`.slice(0, 200);
  }
  if (carrier && !t.toLowerCase().includes(carrier.toLowerCase())) {
    t = `${carrier} ${t}`;
  }
  if (merchant && looksGeneric) {
    return `Paketlieferung - ${merchant}`.slice(0, 200);
  }
  if (merchant && !carrier) {
    const m0 = merchant.toLowerCase().split(".")[0] || merchant;
    if (!t.toLowerCase().includes(m0.toLowerCase())) {
      t = `${t} - ${merchant}`;
    }
  }

  // Non-shipping: Absender / Betreff-Kern wenn der Titel noch generisch/kurz ist
  if (!carrier && ctx) {
    const subj = (ctx.subject || "").trim();
    if (
      looksGeneric &&
      subj &&
      subj !== "(kein Betreff)" &&
      subj.length <= 80
    ) {
      t = subj;
    }
    const from = (ctx.fromName || "").trim();
    if (
      from &&
      from.length >= 2 &&
      from.length <= 40 &&
      !SKIP_MERCHANT_HOST.test(from) &&
      !t.toLowerCase().includes(from.toLowerCase()) &&
      t.length + from.length < 90
    ) {
      t = `${t} · ${from}`;
    }
  }

  return t.slice(0, 200);
}

function enrichTaskTitle(
  title: string,
  carrier: string | null,
  merchant: string | null
): string {
  const t = title.trim();
  if (/^paket annehmen$/i.test(t) && (carrier || merchant)) {
    const who = [carrier, merchant].filter(Boolean).join(" · ");
    return `Paket annehmen (${who})`;
  }
  return t;
}

function enrichNoteTitle(
  title: string,
  carrier: string | null,
  merchant: string | null
): string {
  const t = title.trim();
  if (
    /tracking/i.test(t) &&
    carrier &&
    !t.toLowerCase().includes(carrier.toLowerCase())
  ) {
    return merchant
      ? `${carrier} Tracking - ${merchant}`
      : `${carrier} Tracking`;
  }
  return t;
}

function enrichEventTimes(
  s: MailSuggestion,
  window: DeliveryWindow | null
): MailSuggestion {
  if (s.kind !== "event" || !window) return s;
  if (s.startTime) return s;
  return {
    ...s,
    startTime: window.startTime,
    endTime: s.endTime || window.endTime,
    allDay: false,
  };
}

/** Post-process AI suggestions: carrier, merchant, delivery window, title context. */
export function enrichMailAnalysisTitles(
  analysis: MailAnalysis,
  ctx: { from: string; fromName: string; subject: string; body: string }
): MailAnalysis {
  const hay = `${ctx.fromName} ${ctx.from} ${ctx.subject} ${ctx.body}`;
  const carrier = detectCarrier(hay);
  const merchant = detectMerchant(hay);
  const window = detectDeliveryWindow(hay);

  const suggestions: MailSuggestion[] = analysis.suggestions.map((s) => {
    let next = s;
    if (s.kind === "event") {
      next = {
        ...next,
        title: enrichEventTitle(s.title, carrier, merchant, ctx),
      };
      next = enrichEventTimes(next, window);
    } else if (s.kind === "task") {
      next = {
        ...next,
        title: enrichTaskTitle(s.title, carrier, merchant),
      };
    } else if (s.kind === "note") {
      next = {
        ...next,
        title: enrichNoteTitle(s.title, carrier, merchant),
      };
    }
    return next;
  });

  return { ...analysis, suggestions };
}
