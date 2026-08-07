import { SettingsCalendarsPanel } from "@/components/settings/settings-calendars-panel";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <div className="space-y-6 pb-28 md:space-y-8 md:pb-0">
      <PageHeader
        title="Konto"
        description="Deine persönlichen Einstellungen — Kalender und Feeds gehören nur dir."
        icon={pageVisuals.account.icon}
        tone={pageVisuals.account.tone}
      />
      <SettingsCalendarsPanel />
    </div>
  );
}
