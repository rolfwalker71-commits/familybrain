import { hashContent } from "@/lib/utils/hash";
import { VECTOR_CHUNK_OVERLAP, VECTOR_CHUNK_SIZE } from "./constants";
import type { TextChunk } from "./types";

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function splitTextIntoChunks(
  text: string,
  options?: { chunkSize?: number; overlap?: number }
): TextChunk[] {
  const chunkSize = options?.chunkSize ?? VECTOR_CHUNK_SIZE;
  const overlap = options?.overlap ?? VECTOR_CHUNK_OVERLAP;
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: TextChunk[] = [];
  let buffer = "";

  function flushBuffer() {
    const trimmed = buffer.trim();
    if (!trimmed) return;
    chunks.push({ index: chunks.length, text: trimmed });
    buffer = "";
  }

  for (const paragraph of paragraphs) {
    const piece = paragraph.trim();
    if (!piece) continue;

    if (piece.length > chunkSize) {
      flushBuffer();
      let offset = 0;
      while (offset < piece.length) {
        const slice = piece.slice(offset, offset + chunkSize).trim();
        if (slice) {
          chunks.push({ index: chunks.length, text: slice });
        }
        if (offset + chunkSize >= piece.length) break;
        offset += Math.max(1, chunkSize - overlap);
      }
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${piece}` : piece;
    if (candidate.length <= chunkSize) {
      buffer = candidate;
    } else {
      flushBuffer();
      buffer = piece;
    }
  }

  flushBuffer();
  return chunks.map((chunk, index) => ({ ...chunk, index }));
}

export function hashChunks(chunks: TextChunk[]): string {
  return hashContent(chunks.map((chunk) => chunk.text).join("\n---\n"));
}
