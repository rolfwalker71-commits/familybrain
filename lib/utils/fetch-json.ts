/** Parse JSON API responses; surface HTML/proxy errors clearly. */

export async function readResponseJson<T = unknown>(
  res: Response
): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(
      res.ok
        ? "Leere Serverantwort."
        : `Serverfehler (HTTP ${res.status}).`
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const looksHtml = trimmed.startsWith("<") || /<html[\s>]/i.test(trimmed);
    throw new Error(
      looksHtml
        ? `Server lieferte HTML statt JSON (HTTP ${res.status}). Oft Proxy-/Auth-Fehler oder überladene Antwort.`
        : `Ungültige Serverantwort (HTTP ${res.status}).`
    );
  }
}
