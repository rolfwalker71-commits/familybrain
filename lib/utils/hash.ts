import { createHash } from "crypto";

export function hashContent(content: string | null | undefined): string {
  return createHash("sha256")
    .update(content ?? "")
    .digest("hex");
}
