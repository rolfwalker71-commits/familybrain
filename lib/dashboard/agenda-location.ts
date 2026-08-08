/**
 * True for real places worth geocoding / map / drive time.
 * Rejects online-meeting labels like «Teams Besprechung», Zoom, Meet-URLs, …
 */
export function isPhysicalAgendaLocation(
  location: string | null | undefined
): boolean {
  const t = (location || "").trim();
  if (t.length < 3) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/i.test(t)) return false;

  const key = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!key || key.length < 3) return false;

  const looksLikeStreet =
    /\d/.test(t) &&
    (/,/.test(t) || /strasse|weg|gasse|platz/i.test(t));

  // Explicit online / phone meeting phrasing without a street/PLZ
  const onlineish =
    /\b(microsoft\s+)?teams(\s+besprechung|\s+meeting)?\b/i.test(t) ||
    /\b(zoom|webex|skype|discord|jitsi|facetime)\b/i.test(t) ||
    /\b(google\s+)?meet\b/i.test(t) ||
    /\b(videokonferenz|telefonkonferenz|online[- ]?meeting|remote)\b/i.test(
      t
    ) ||
    /\b(phone|telefon)\s*(call|konferenz)?\b/i.test(t);

  if (onlineish) {
    if (looksLikeStreet || /\b\d{4}\b/.test(t)) return true;
    return false;
  }

  if (
    /^(büro|office|home|zuhause|privat|tbd|tba|n\/a|—|-)$/i.test(t) &&
    !looksLikeStreet
  ) {
    return false;
  }

  return true;
}
