import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy URL → generic Wissen browse. */
export default function KnowledgeSteuernRedirectPage() {
  redirect("/knowledge/Steuern");
}
