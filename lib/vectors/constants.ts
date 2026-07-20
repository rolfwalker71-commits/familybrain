export const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
export const DEFAULT_QDRANT_COLLECTION = "familybrain_chunks";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export const VECTOR_CHUNK_SIZE = Number(process.env.VECTOR_CHUNK_SIZE || 1000);
export const VECTOR_CHUNK_OVERLAP = Number(process.env.VECTOR_CHUNK_OVERLAP || 150);
export const VECTOR_MIN_SCORE = Number(process.env.VECTOR_MIN_SCORE || 0.4);
export const VECTOR_SEARCH_LIMIT = 8;

export type VectorSourceType = "guide" | "trilium" | "paperless";
