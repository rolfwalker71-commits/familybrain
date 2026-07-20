import { getSetting } from "@/lib/db/migrations";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/vectors/constants";

export function getOpenAIEmbeddingModel(): string {
  return (
    getSetting("openai_embedding_model") ||
    process.env.OPENAI_EMBEDDING_MODEL ||
    DEFAULT_EMBEDDING_MODEL
  );
}
