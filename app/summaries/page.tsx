import { redirect } from "next/navigation";

/** Legacy route — summaries live in document detail / knowledge now. */
export default function SummariesPage() {
  redirect("/documents");
}
