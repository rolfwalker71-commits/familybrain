import { SettingsCalendarsPanel } from "@/components/settings/settings-calendars-panel";
import { SettingsGoogleCalendarsPanel } from "@/components/settings/settings-google-calendars-panel";
import { SettingsGoogleConnectPanel } from "@/components/settings/settings-google-connect-panel";
import { SettingsMicrosoftCalendarsPanel } from "@/components/settings/settings-microsoft-calendars-panel";
import { SettingsMicrosoftConnectPanel } from "@/components/settings/settings-microsoft-connect-panel";
import { DriveMirrorStatusPanel } from "@/components/settings/drive-mirror-status-panel";
import { O365PdfBackfillPanel } from "@/components/settings/o365-pdf-backfill-panel";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <div className="space-y-6 pb-28 md:space-y-8 md:pb-0">
      <PageHeader
        title="Konto"
        description="Google und Microsoft 365 — getrennt von anderen Buddy-Usern."
        icon={pageVisuals.account.icon}
        tone={pageVisuals.account.tone}
      />
      <SettingsGoogleConnectPanel />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Lade…</p>}>
        <SettingsMicrosoftConnectPanel />
      </Suspense>
      <DriveMirrorStatusPanel />
      <O365PdfBackfillPanel />
      <SettingsGoogleCalendarsPanel />
      <SettingsMicrosoftCalendarsPanel />
      <SettingsCalendarsPanel />
    </div>
  );
}
