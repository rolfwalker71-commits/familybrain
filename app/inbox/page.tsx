import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { ActionInbox } from "@/components/dashboard/action-inbox";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <div className="min-w-0 space-y-6 pb-6 md:space-y-8">
      <PageHeader
        title="Inbox"
        description="Triage, Fristen, Rechnungen und Garantien — zum Abarbeiten"
        icon={pageVisuals.inbox.icon}
        tone={pageVisuals.inbox.tone}
      />
      <ActionInbox />
    </div>
  );
}
