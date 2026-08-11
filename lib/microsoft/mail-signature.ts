import { getSetting, setSetting } from "@/lib/db/migrations";

const signatureKey = (userId: number) =>
  `microsoft_mail_signature_u${userId}`;

export type MicrosoftMailSignature = {
  /** Plain text or HTML snippet pasted from Outlook. */
  text: string;
  /** When true, append on every Buddy send (reply + compose). */
  appendOnSend: boolean;
};

const DEFAULT: MicrosoftMailSignature = {
  text: "",
  appendOnSend: true,
};

export function getMicrosoftMailSignature(
  userId: number
): MicrosoftMailSignature {
  try {
    const raw = getSetting(signatureKey(userId));
    if (!raw?.trim()) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<MicrosoftMailSignature>;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      appendOnSend:
        typeof parsed.appendOnSend === "boolean"
          ? parsed.appendOnSend
          : true,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function setMicrosoftMailSignature(
  userId: number,
  input: Partial<MicrosoftMailSignature>
): MicrosoftMailSignature {
  const prev = getMicrosoftMailSignature(userId);
  const next: MicrosoftMailSignature = {
    text:
      input.text !== undefined
        ? String(input.text).slice(0, 20_000)
        : prev.text,
    appendOnSend:
      input.appendOnSend !== undefined
        ? Boolean(input.appendOnSend)
        : prev.appendOnSend,
  };
  setSetting(signatureKey(userId), JSON.stringify(next));
  return next;
}

/** Append Buddy-stored signature (Graph cannot read Outlook client signatures). */
export function appendMailSignature(
  body: string,
  signature: string | null | undefined,
  contentType: "Text" | "HTML" = "Text"
): string {
  const sig = (signature || "").trim();
  if (!sig) return body;
  const base = body.replace(/\s+$/, "");
  if (contentType === "HTML") {
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(sig);
    const sigHtml = looksHtml
      ? sig
      : sig
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>");
    return `${base}<br/><br/>${sigHtml}`;
  }
  return `${base}\n\n${sig}`;
}
