/**
 * Merchant strings on credit-card statements are noisy: acquirer prefixes,
 * store numbers, city and country codes. Canonicalizing them is what makes
 * yearly totals per merchant (Google, OpenAI, SBB, …) meaningful.
 */

export type CanonicalMerchant = {
  /** Stable slug used for grouping and logo cache filenames. */
  key: string;
  /** Display name — brand name when known, else cleaned raw text. */
  label: string;
  /** Domain for logo lookup; null when the merchant is unknown. */
  domain: string | null;
};

/** Brands that recur on Swiss household statements — patterns are lowercase. */
const BRANDS: Array<{
  key: string;
  label: string;
  domain: string;
  match: RegExp;
}> = [
  { key: "google", label: "Google", domain: "google.com", match: /\bgoogle\b/ },
  {
    key: "openai",
    label: "OpenAI",
    domain: "openai.com",
    match: /\bopenai|chatgpt\b/,
  },
  {
    key: "anthropic",
    label: "Anthropic",
    domain: "anthropic.com",
    match: /\banthropic|claude\.ai\b/,
  },
  { key: "github", label: "GitHub", domain: "github.com", match: /\bgithub\b/ },
  {
    key: "microsoft",
    label: "Microsoft",
    domain: "microsoft.com",
    match: /\bmicrosoft|msft|office\s*365|microsoft\s*365\b/,
  },
  {
    key: "cursor",
    label: "Cursor",
    domain: "cursor.com",
    match: /\bcursor(\s*(ai|sh|com))?\b/,
  },
  { key: "apple", label: "Apple", domain: "apple.com", match: /\bapple\b/ },
  {
    key: "amazon",
    label: "Amazon",
    domain: "amazon.com",
    match: /\bamazon|amzn\b/,
  },
  {
    key: "netflix",
    label: "Netflix",
    domain: "netflix.com",
    match: /\bnetflix\b/,
  },
  {
    key: "spotify",
    label: "Spotify",
    domain: "spotify.com",
    match: /\bspotify\b/,
  },
  {
    key: "adobe",
    label: "Adobe",
    domain: "adobe.com",
    match: /\badobe\b/,
  },
  {
    key: "dropbox",
    label: "Dropbox",
    domain: "dropbox.com",
    match: /\bdropbox\b/,
  },
  {
    key: "hetzner",
    label: "Hetzner",
    domain: "hetzner.com",
    match: /\bhetzner\b/,
  },
  {
    key: "digitalocean",
    label: "DigitalOcean",
    domain: "digitalocean.com",
    match: /\bdigitalocean\b/,
  },
  {
    key: "cloudflare",
    label: "Cloudflare",
    domain: "cloudflare.com",
    match: /\bcloudflare\b/,
  },
  { key: "sbb", label: "SBB", domain: "sbb.ch", match: /\bsbb|cff|ffs\b/ },
  {
    key: "migros",
    label: "Migros",
    domain: "migros.ch",
    match: /\bmigros|migrolino\b/,
  },
  { key: "coop", label: "Coop", domain: "coop.ch", match: /\bcoop\b/ },
  {
    key: "swisscom",
    label: "Swisscom",
    domain: "swisscom.ch",
    match: /\bswisscom\b/,
  },
  { key: "salt", label: "Salt", domain: "salt.ch", match: /\bsalt\s*mobile\b/ },
  {
    key: "sunrise",
    label: "Sunrise",
    domain: "sunrise.ch",
    match: /\bsunrise\b/,
  },
  {
    key: "digitec",
    label: "Digitec Galaxus",
    domain: "digitec.ch",
    match: /\bdigitec|galaxus\b/,
  },
  {
    key: "booking",
    label: "Booking.com",
    domain: "booking.com",
    match: /\bbooking\.?com\b/,
  },
  { key: "airbnb", label: "Airbnb", domain: "airbnb.com", match: /\bairbnb\b/ },
  {
    key: "swiss",
    label: "SWISS",
    domain: "swiss.com",
    match: /\bswiss\s*intl|swiss\s*air|lx\s*swiss\b/,
  },
  {
    key: "lufthansa",
    label: "Lufthansa",
    domain: "lufthansa.com",
    match: /\blufthansa\b/,
  },
  { key: "uber", label: "Uber", domain: "uber.com", match: /\buber\b/ },
  { key: "paypal", label: "PayPal", domain: "paypal.com", match: /^paypal$/ },
  {
    key: "twint",
    label: "TWINT",
    domain: "twint.ch",
    match: /\btwint\b/,
  },
  {
    key: "post",
    label: "Die Post",
    domain: "post.ch",
    match: /\bdie\s*post|post\s*ch\b/,
  },
  {
    key: "ikea",
    label: "IKEA",
    domain: "ikea.com",
    match: /\bikea\b/,
  },
  {
    key: "youtube",
    label: "YouTube",
    domain: "youtube.com",
    match: /\byoutube\b/,
  },
  {
    key: "notion",
    label: "Notion",
    domain: "notion.so",
    match: /\bnotion\b/,
  },
  {
    key: "slack",
    label: "Slack",
    domain: "slack.com",
    match: /\bslack\b/,
  },
  {
    key: "zoom",
    label: "Zoom",
    domain: "zoom.us",
    match: /\bzoom(\.us)?\b/,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    domain: "linkedin.com",
    match: /\blinkedin\b/,
  },
  {
    key: "steam",
    label: "Steam",
    domain: "steampowered.com",
    match: /\bsteam(games|powered)?\b/,
  },
];

/** Acquirer / payment-processor prefixes that hide the real merchant. */
const PROCESSOR_PREFIX =
  /^(paypal|sq|sp|tst|wpy|pp|stripe|adyen|klarna|sumup|payrexx|datatrans)\s*[*·]\s*/i;

/**
 * Only unambiguous tails are removed. The place name is kept — telling
 * «MEIER ZUERICH» (merchant) from «ZUERICH» (location) is guesswork, and
 * grouping uses the leading tokens anyway.
 */
const TRAILING_NOISE = [
  /\s+(ch|de|at|fr|it|us|gb|ie|nl|lu|es|se|sg|jp)$/i,
  /\s+(nr\.?|no\.?|#)\s*\d{2,}$/i,
  /\s+\d{4,}$/,
];

function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Human-readable merchant text without processor prefix and place/number tails. */
export function cleanMerchantText(raw: string | null | undefined): string {
  let text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  text = text.replace(PROCESSOR_PREFIX, "");
  // «GOOGLE *WORKSPACE» / «OPENAI*CHATGPT» → keep the part before the star,
  // it is the brand; the suffix is the product.
  text = text.replace(/\s*\*\s*/g, " · ");
  for (const noise of TRAILING_NOISE) {
    text = text.replace(noise, "").trim();
  }
  return text.replace(/[·,\-\s]+$/, "").trim();
}

function slugify(text: string): string {
  return (
    stripDiacritics(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "unbekannt"
  );
}

function titleCase(text: string): string {
  if (!/[a-z]/.test(text)) {
    return text
      .toLowerCase()
      .split(" ")
      .map((word) =>
        word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word
      )
      .join(" ");
  }
  return text;
}

/**
 * Map a printed merchant string to a stable brand identity.
 * Unknown merchants keep their cleaned name and get no logo domain.
 */
export function canonicalMerchant(
  raw: string | null | undefined
): CanonicalMerchant {
  const cleaned = cleanMerchantText(raw);
  if (!cleaned) {
    return { key: "unbekannt", label: "Unbekannt", domain: null };
  }
  const haystack = stripDiacritics(cleaned).toLowerCase();
  for (const brand of BRANDS) {
    if (brand.match.test(haystack)) {
      return { key: brand.key, label: brand.label, domain: brand.domain };
    }
  }
  // Unknown: group by the leading token(s) so «MIGROL TANKSTELLE ALTDORF» and
  // «MIGROL TANKSTELLE ERSTFELD» still land together.
  const lead = cleaned.split(" · ")[0]!.split(" ").slice(0, 2).join(" ");
  return { key: slugify(lead), label: titleCase(lead), domain: null };
}

export function merchantLogoUrl(merchant: CanonicalMerchant): string | null {
  if (!merchant.domain) return null;
  return `/api/merchants/logo/${encodeURIComponent(merchant.key)}`;
}

/** Domain for a known merchant key — used by the logo route. */
export function merchantDomainForKey(key: string): string | null {
  const brand = BRANDS.find((b) => b.key === key);
  return brand?.domain ?? null;
}
