import { createHash } from "crypto";
import type { VectorSourceType } from "./constants";

export function buildVectorPointId(
  sourceType: VectorSourceType,
  sourceId: string,
  chunkIndex: number
): string {
  const raw = `${sourceType}:${sourceId}:${chunkIndex}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
