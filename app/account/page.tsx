import { SettingsCalendarsPanel } from "@/components/settings/settings-calendars-panel";
import { SettingsGoogleCalendarsPanel } from "@/components/settings/settings-google-calendars-panel";
import { SettingsGoogleConnectPanel } from "@/components/settings/settings-google-connect-panel";
import { SettingsMicrosoftCalendarsPanel } from "@/components/settings/settings-microsoft-calendars-panel";
import { SettingsMicrosoftConnectPanel } from "@/components/settings/settings-microsoft-connect-panel";
import { DriveMirrorStatusPanel } from "@/components/settings/drive-mirror-status-panel";
import { O365PdfBackfillPanel } from "@/components/settings/o365-pdf-backfill-panel";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { getAuthContext } from "@/lib/auth/current-user";
import { Suspense, type ReactNode } from "react";

export const dynamic = "force-dynamic";

function AccountSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default async function AccountPage() {
  const ctx = await getAuthContext();
  const isAdmin = Boolean(ctx?.isAdmin);

  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <PageHeader
        title="Konto"
        description="Verbindungen und Kalenderquellen — getrennt von anderen Buddy-Usern."
        icon={pageVisuals.account.icon}
        tone={pageVisuals.account.tone}
      />

      <AccountSection
        title="Verbindungen"
        description="Google Workspace und Microsoft 365 für diesen User."
      >
        <SettingsGoogleConnectPanel />
        <Suspense
          fallback={<p className="text-sm text-muted-foreground">Lade…</p>}
        >
          <SettingsMicrosoftConnectPanel />
        </Suspense>
      </AccountSection>

      <AccountSection
        title="Kalenderquellen"
        description="Welche Google-/Microsoft-/ICS-Kalender in Buddy erscheinen."
      >
        <SettingsGoogleCalendarsPanel />
        <SettingsMicrosoftCalendarsPanel />
        <SettingsCalendarsPanel />
      </AccountSection>

      {isAdmin ? (
        <AccountSection
          title="Spiegel & Import"
          description="Drive-Spiegel und historische O365-PDFs nach Paperless."
        >
          <DriveMirrorStatusPanel />
          <O365PdfBackfillPanel />
        </AccountSection>
      ) : null}
    </div>
  );
}
