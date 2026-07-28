import { getAuthContext } from "@/lib/auth/current-user";
import { userAvatarPublicUrl } from "@/lib/users/avatar";
import { getAppUserById } from "@/lib/users/queries";
import { UserAvatar } from "@/components/users/user-avatar";
import Link from "next/link";
import {
  FileText,
  Clock3,
  CalendarDays,
  Shield,
  TrendingUp,
  Wallet,
  Plane,
  AlertCircle,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardStats, listDeadlines } from "@/lib/db/queries";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";
import { MetricGrid, PageHeader, MetricTile } from "@/components/layout/page-primitives";
import {
  IconCircle,
  pageVisuals,
  type IconTone,
} from "@/components/layout/icon-circle";
import { DocumentInfoButton } from "@/components/documents/document-link";
import type { LucideIcon } from "lucide-react";
import { ActionInbox } from "@/components/dashboard/action-inbox";

export const dynamic = "force-dynamic";

function StatCard({
  title,
  value,
  icon,
  tone,
  href,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone: IconTone;
  href?: string;
}) {
  const content = (
    <MetricTile title={title} value={value} icon={icon} tone={tone} className="h-full" />
  );

  return href ? (
    <Link href={href} className="min-w-0">
      {content}
    </Link>
  ) : (
    content
  );
}

export default async function DashboardPage() {
  const stats = getDashboardStats();
  const auth = await getAuthContext();
  const user =
    auth && !auth.isAdmin && auth.userId
      ? getAppUserById(auth.userId)
      : null;
  const welcomeName = user?.display_name || auth?.username || null;
  const welcomeAvatar = userAvatarPublicUrl(user?.avatar_path);
  const upcoming = (
    listDeadlines("open") as {
      id: number;
      title: string;
      deadline_date: string | null;
      deadline_type: string | null;
      document_local_id: number;
      correspondent_name: string | null;
    }[]
  )
    .filter((d) => d.deadline_date)
    .slice(0, 5);

  return (
    <div className="min-w-0 space-y-6 pb-6 md:space-y-8">
      {welcomeName ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-[var(--brand-finance-soft)]/50 px-4 py-3">
          <UserAvatar name={welcomeName} src={welcomeAvatar} size="lg" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Willkommen</p>
            <p className="truncate text-lg font-semibold tracking-tight">
              {welcomeName}
            </p>
          </div>
        </div>
      ) : null}
      <PageHeader
        title="Dashboard"
        description="Überblick über deine Dokumente und Analysen"
        icon={pageVisuals.dashboard.icon}
        tone={pageVisuals.dashboard.tone}
      />

      <ActionInbox />

      <MetricGrid>
        <StatCard
          title="Dokumente synchronisiert"
          value={stats.totalDocuments}
          icon={FileText}
          tone="teal"
          href="/documents"
        />
        <StatCard
          title="Analyse ausstehend"
          value={stats.pendingAnalysis}
          icon={Clock3}
          tone="teal"
          href="/documents?analysisStatus=pending"
        />
        <StatCard
          title="Anstehende Fristen"
          value={stats.upcomingDeadlines}
          icon={CalendarDays}
          tone="teal"
          href="/deadlines"
        />
        <StatCard
          title="Garantien bald abgelaufen"
          value={stats.warrantiesExpiringSoon}
          icon={Shield}
          tone="teal"
          href="/warranties"
        />
        <StatCard
          title="Analysiert"
          value={stats.analyzed}
          icon={TrendingUp}
          tone="teal"
          href="/summaries"
        />
        <StatCard
          title="Ausgaben dieses Jahr (ohne Unbekannt)"
          value={formatCHF(stats.financialTotalThisYear)}
          icon={Wallet}
          tone="teal"
          href="/finance"
        />
        <StatCard
          title="Reiseunterlagen"
          value={stats.travelDocuments}
          icon={Plane}
          tone="teal"
          href="/travel"
        />
      </MetricGrid>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card tone="teal" className="min-w-0 overflow-hidden shadow-sm">
          <CardHeader
            tone="teal"
            className="flex flex-row items-center justify-between gap-3"
          >
            <CardTitle className="text-base font-semibold">
              Zuletzt analysiert
            </CardTitle>
            <IconCircle icon={Sparkles} tone="teal" size="sm" />
          </CardHeader>
          <CardContent className="min-w-0">
            {stats.recentAnalyses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Noch keine Dokumente analysiert
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentAnalyses.map((item) => {
                  const row = item as {
                    id: number;
                    title: string | null;
                    correspondent_name: string | null;
                    category: string | null;
                    short_summary: string | null;
                    analyzed_at: string | null;
                  };
                  return (
                    <div
                      key={row.id}
                      className="flex min-w-0 items-start gap-2 rounded-xl border border-border/60 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-colors hover:bg-muted/40"
                    >
                      <Link
                        href={`/documents/${row.id}`}
                        className="min-w-0 flex-1"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium hover:underline">
                              {row.title || `Dokument #${row.id}`}
                            </div>
                            {row.correspondent_name ? (
                              <p className="mt-0.5 truncate text-xs font-medium text-foreground/75">
                                {row.correspondent_name}
                              </p>
                            ) : null}
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {row.short_summary || "Keine Kurzfassung"}
                            </p>
                          </div>
                          <div className="flex max-w-[35%] shrink-0 flex-col items-end gap-1">
                            {row.category ? (
                              <Badge
                                variant="secondary"
                                className="max-w-full truncate"
                                title={row.category}
                              >
                                {row.category}
                              </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {toSwissDate(row.analyzed_at)}
                            </span>
                          </div>
                        </div>
                      </Link>
                      <DocumentInfoButton documentId={row.id} size="icon-sm" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card tone="teal" className="min-w-0 overflow-hidden shadow-sm">
          <CardHeader
            tone="teal"
            className="flex flex-row items-center justify-between gap-3"
          >
            <CardTitle className="text-base font-semibold">
              Nächste Fristen
            </CardTitle>
            <IconCircle icon={Calendar} tone="teal" size="sm" />
          </CardHeader>
          <CardContent className="min-w-0">
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Calendar className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Keine anstehenden Fristen
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((row) => (
                  <div
                    key={row.id}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-colors hover:bg-muted/40"
                  >
                    <Link
                      href={`/documents/${row.document_local_id}`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium hover:underline">
                          {row.title}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {[
                            row.correspondent_name,
                            row.deadline_type || "Frist",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-medium">
                        {toSwissDate(row.deadline_date)}
                      </span>
                    </Link>
                    <DocumentInfoButton
                      documentId={row.document_local_id}
                      size="icon-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
