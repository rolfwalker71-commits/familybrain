import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./config";

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodePayload(payload: SessionPayload): string {
  return bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
}

function decodePayload(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(value))
    ) as Partial<SessionPayload>;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      username: parsed.username,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(
  username: string,
  secret: string,
  now = Date.now()
): Promise<string> {
  const payload = encodePayload({
    username,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  });
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(
  token: string | null | undefined,
  secret: string,
  expectedUsername: string,
  now = Date.now()
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) return null;

  try {
    const key = await importSigningKey(secret);
    const signatureBytes = Uint8Array.from(
      base64UrlToBytes(signaturePart)
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes.buffer,
      new TextEncoder().encode(payloadPart)
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  const payload = decodePayload(payloadPart);
  if (
    !payload ||
    payload.username !== expectedUsername ||
    payload.expiresAt <= now
  ) {
    return null;
  }
  return payload;
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
