import type { VectorSourceType } from "./constants";

export type VectorChunkPayload = {
  source_type: VectorSourceType;
  source_id: string;
  chunk_index: number;
  title: string;
  text: string;
  content_hash: string;
  page_start?: number | null;
  page_end?: number | null;
  scope_label?: string | null;
  category?: string | null;
  url?: string | null;
  embedded_at: string;
};

export type TextChunk = {
  index: number;
  text: string;
  pageStart?: number | null;
  pageEnd?: number | null;
};

export type VectorSearchHit = {
  pointId: string;
  score: number;
  payload: VectorChunkPayload;
};

export type GuideSource = {
  kind: "guide";
  id: number;
  title: string;
  excerpt: string;
  score: number;
  pageStart?: number | null;
  pageEnd?: number | null;
};

export type TriliumNoteSource = {
  kind: "trilium";
  noteId: string;
  title: string;
  scopeLabel: string;
  excerpt: string;
  url: string;
  score: number;
};
