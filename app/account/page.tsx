import { NotificationPrefsPanel } from "@/components/settings/notification-prefs-panel";
import { DeviceTokensPanel } from "@/components/settings/device-tokens-panel";
import { PageHeader } from "@/components/layout/page-primitives";

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-16 sm:p-6">
      <PageHeader
        title="Konto"
        description="Benachrichtigungen und Android-Geräte für Widgets."
      />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Benachrichtigungen
        </h2>
        <NotificationPrefsPanel />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Android / Widgets
        </h2>
        <DeviceTokensPanel />
      </section>
    </div>
  );
}
