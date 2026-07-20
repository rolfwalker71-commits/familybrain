import {
  deleteKnowledgeGuide,
  type KnowledgeGuideRow,
} from "@/lib/db/queries";
import { deleteGuideFile } from "@/lib/guides/storage";
import { deleteVectorPointsBySource } from "@/lib/vectors/client";

/** Removes guide from SQLite, disk, and Qdrant vector index. */
export async function removeKnowledgeGuideFully(
  guideId: number
): Promise<KnowledgeGuideRow | null> {
  const guide = deleteKnowledgeGuide(guideId);
  if (!guide) return null;

  deleteGuideFile(guide.file_path);
  await deleteVectorPointsBySource("guide", String(guideId));
  return guide;
}
