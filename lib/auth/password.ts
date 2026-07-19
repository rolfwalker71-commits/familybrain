import {
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
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
    const [, salt, expected] = config.passwordHash.split(":");
    if (salt && expected) {
      const actual = (await scrypt(
        submittedPassword,
        salt,
        KEY_LENGTH
      )) as Buffer;
      const expectedBuffer = Buffer.from(expected, "base64url");
      passwordMatches =
        actual.length === expectedBuffer.length &&
        timingSafeEqual(actual, expectedBuffer);
    }
  } else if (config.password !== null) {
    passwordMatches = safeEqualText(submittedPassword, config.password);
  }

  return usernameMatches && passwordMatches;
}
