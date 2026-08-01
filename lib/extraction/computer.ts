/** Heuristic: IT / software / computer hardware documents. */

const COMPUTER_DOC_RE =
  /software(?:lizenz|abo|abonnement)?|lizenzschlüssel|license\s*key|product\s*key|microsoft\s*365|office\s*365|adobe\s*(creative|acrobat)|jetbrains|github|gitlab|aws\s*invoice|laptop|notebook|macbook|chromebook|grafikkarte|geforce|radeon|ssd\b|nvme|mainboard|motherboard|drucker(?:toner)?|monitor\b|bildschirm|windows\s*(pro|home|11|10)|macos|ubuntu|synology|nas\b|raspberry\s*pi|computer\s*(reparation|reparatur|kauf)|it[-\s]?hardware|softwarelizenz/i;

export function looksLikeComputerDocument(text: string): boolean {
  return COMPUTER_DOC_RE.test(text || "");
}
