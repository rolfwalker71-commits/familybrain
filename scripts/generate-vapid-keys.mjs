import { generateVAPIDKeys } from "web-push";

const keys = generateVAPIDKeys();
process.stdout.write(
  [
    "# Add to host .env (Docker) or .env.local — then restart Buddy",
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    "VAPID_SUBJECT=mailto:you@example.com",
    "",
  ].join("\n")
);
