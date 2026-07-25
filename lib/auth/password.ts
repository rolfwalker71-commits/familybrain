import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = bytesToBase64Url(randomBytes(16));
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derived.toString("base64url")}`;
}

export async function verifyPasswordHash(
  password: string,
  passwordHash: string
): Promise<boolean> {
  if (!passwordHash.startsWith("scrypt:")) return false;
  const [, salt, expected] = passwordHash.split(":");
  if (!salt || !expected) return false;
  const actual = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");
  return (
    actual.length === expectedBuffer.length &&
    timingSafeEqual(actual, expectedBuffer)
  );
}

function bytesToBase64Url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function verifyConfiguredPassword(
  submittedUsername: string,
  submittedPassword: string,
  config: {
    username: string;
    password: string | null;
    passwordHash: string | null;
  }
): Promise<boolean> {
  const usernameMatches = safeEqualText(
    submittedUsername.trim(),
    config.username
  );

  let passwordMatches = false;
  if (config.passwordHash?.startsWith("scrypt:")) {
    passwordMatches = await verifyPasswordHash(
      submittedPassword,
      config.passwordHash
    );
  } else if (config.password !== null) {
    passwordMatches = safeEqualText(submittedPassword, config.password);
  }

  return usernameMatches && passwordMatches;
}
