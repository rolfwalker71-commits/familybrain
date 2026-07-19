import { randomBytes, scryptSync } from "node:crypto";
import process from "node:process";

const password = process.argv[2];
if (!password) {
  console.error(
    "Verwendung: npm run auth:secrets -- 'DEIN-SICHERES-PASSWORT'"
  );
  process.exit(1);
}
if (password.length < 12) {
  console.error("Das Passwort muss mindestens 12 Zeichen lang sein.");
  process.exit(1);
}

const salt = randomBytes(24).toString("base64url");
const hash = scryptSync(password, salt, 64).toString("base64url");
const sessionSecret = randomBytes(48).toString("base64url");

console.log(`FAMILYBRAIN_PASSWORD_HASH=scrypt:${salt}:${hash}`);
console.log(`FAMILYBRAIN_SESSION_SECRET=${sessionSecret}`);
