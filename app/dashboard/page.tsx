import { getAuthContext } from "@/lib/auth/current-user";
import { userAvatarPublicUrl } from "@/lib/users/avatar";
import { getAppUserById, getAppUserByUsername } from "@/lib/users/queries";
import { UserAvatar } from "@/components/users/user-avatar";
import Link from "next/link";
import {
  FileText,
  CalendarDays,
  Shield,
  Wallet,
  AlertCircle,
  Calendar,
  Sparkles,
  Clock3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getDashboardInbox,
  getDashboardStats,
  listDeadlines,
} from "@/lib/db/queries";
import { buildDashboardBriefing } from "@/lib/dashboard/briefing";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";
import {
  ACTION_DEADLINE_AHEAD_DAYS,
  ACTION_WARRANTY_AHEAD_DAYS,
} from "@/lib/utils/due-urgency";
import { MetricGrid, PageHeader, MetricTile } from "@/components/layout/page-primitives";
import {
  IconCircle,
  pageVisuals,
  type IconTone,
} from "@/components/layout/icon-circle";
import { DocumentInfoButton } from "@/components/documents/document-link";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { RecipientAvatars } from "@/components/family/recipient-avatars";
import type { RecipientAvatarInfo } from "@/components/family/recipient-avatars";
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

function greetingForHour(hour: number): string {
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export default async function DashboardPage() {
  const stats = getDashboardStats();
  const inbox = getDashboardInbox({ each: 3 });
  const auth = await getAuthContext();
  const user = auth?.userId
    ? getAppUserById(auth.userId)
    : auth?.kind === "admin"
      ? getAppUserByUsername(auth.username)
      : null;
  const welcomeName = user?.display_name || auth?.username || null;
  const welcomeAvatar = userAvatarPublicUrl(user?.avatar_path);
  const greeting = greetingForHour(new Date().getHours());

  const topUnpaid = inbox.openUnpaidInvoices[0] as
    | {
        vendor: string | null;
        title: string | null;
        amount: number | null;
        currency: string | null;
      }
    | undefined;
  const topDueExtract = inbox.dueInvoices[0] as unknown as
    | {
        vendor: string | null;
        document_title: string | null;
        amount: number | null;
        currency: string | null;
      }
    | undefined;
  const topWarranty = inbox.warrantiesExpiring[0] as unknown as
    | {
        product_name: string | null;
        vendor: string | null;
        warranty_until: string | null;
      }
    | undefined;

  const briefing = buildDashboardBriefing(
    {
      openDueFinanceCount: stats.openDueFinanceCount,
      openDueFinanceAmount: stats.openDueFinanceAmount,
      overdueDeadlinesCount: stats.overdueDeadlinesCount,
      deadlinesNext30Days: stats.deadlinesNext30Days,
      warrantiesExpiringSoon: stats.warrantiesExpiringSoon,
      pendingAnalysis: stats.pendingAnalysis,
    },
    {
      topOpenInvoice: topUnpaid
        ? {
            vendor: topUnpaid.vendor,
            title: topUnpaid.title,
            amount: topUnpaid.amount,
            currency: topUnpaid.currency,
          }
        : topDueExtract
          ? {
              vendor: topDueExtract.vendor,
              title: topDueExtract.document_title,
              amount: topDueExtract.amount,
              currency: topDueExtract.currency,
            }
          : null,
      topWarranty: topWarranty ?? null,
    }
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = (
    listDeadlines("open") as unknown as {
      id: number;
      title: string;
      deadline_date: string | null;
      deadline_type: string | null;
      document_local_id: number;
      correspondent_name: string | null;
      ai_icon_url?: string | null;
      category?: string | null;
      recipients?: RecipientAvatarInfo;
    }[]
  )
    .filter(
      (d) =>
        Boolean(d.deadline_date) &&
        (d.deadline_date as string) >= todayIso
    )
    .sort((a, b) =>
      String(a.deadline_date).localeCompare(String(b.deadline_date))
    )
    .slice(0, 5);

  const deadlineKpi =
    stats.overdueDeadlinesCount > 0
      ? `${stats.overdueDeadlinesCount} überfällig`
      : stats.deadlinesNext30Days;

  return (
    <div className="min-w-0 space-y-6 pb-6 md:space-y-8">
      <div className="rounded-2xl border border-border/60 bg-[var(--brand-finance-soft)]/50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          {welcomeName ? (
            <UserAvatar name={welcomeName} src={welcomeAvatar} size="lg" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {greeting}
              {welcomeName ? "," : ""}
            </p>
            <p className="truncate text-lg font-semibold tracking-tight">
              {welcomeName || "Dashboard"}
            </p>
            {briefing.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Heute relevant
                </p>
                <ul className="mt-1.5 space-y-1">
                  {briefing.map((line) => (
                    <li
                      key={line}
                      className="flex gap-2 text-sm text-foreground/90"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--brand-finance)]" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Aktuell nichts Dringendes.
              </p>
            )}
          </div>
        </div>
      </div>

      <PageHeader
        title="Dashboard"
        description="Was jetzt zählt — und der Überblick darunter"
        icon={pageVisuals.dashboard.icon}
        tone={pageVisuals.dashboard.tone}
      />

      <MetricGrid>
        <StatCard
          title="Offene Beträge"
          value={formatCHF(stats.openDueFinanceAmount)}
          icon={Wallet}
          tone="green"
          href="/finance"
        />
        <StatCard
          title={`Fristen (${ACTION_DEADLINE_AHEAD_DAYS} Tage)`}
          value={deadlineKpi}
          icon={CalendarDays}
          tone="teal"
          href="/deadlines"
        />
        <StatCard
          title={`Garantien (${ACTION_WARRANTY_AHEAD_DAYS} Tage)`}
          value={stats.warrantiesExpiringSoon}
          icon={Shield}
          tone="teal"
          href="/warranties"
        />
        {stats.pendingAnalysis > 0 ? (
          <StatCard
            title="Analyse ausstehend"
            value={stats.pendingAnalysis}
            icon={Clock3}
            tone="teal"
            href="/documents?analysisStatus=pending"
          />
        ) : (
          <StatCard
            title="Dokumente"
            value={stats.totalDocuments}
            icon={FileText}
            tone="teal"
            href="/documents"
          />
        )}
      </MetricGrid>

      <ActionInbox />

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
                  const row = item as unknown as {
                    id: number;
                    title: string | null;
                    correspondent_name: string | null;
                    category: string | null;
                    short_summary: string | null;
                    analyzed_at: string | null;
                    ai_icon_url?: string | null;
                    recipients?: RecipientAvatarInfo;
                  };
                  return (
                    <div
                      key={row.id}
                      className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border/60 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-colors hover:bg-muted/40"
                    >
                      <Link
                        href={`/documents/${row.id}`}
                        className="flex min-w-0 flex-1 items-start gap-2.5"
                      >
                        <DocumentAiIcon
                          aiIconUrl={row.ai_icon_url}
                          category={row.category}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
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
                              <RecipientAvatars
                                recipients={row.recipients}
                                className="mt-1 text-xs"
                              />
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
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-card p-3.5 shadow-[0_4px_16px_rgba(20,32,28,0.05)] transition-colors hover:bg-muted/40"
                  >
                    <Link
                      href={`/documents/${row.document_local_id}`}
                      className="flex min-w-0 flex-1 items-center gap-2.5"
                    >
                      <DocumentAiIcon
                        aiIconUrl={row.ai_icon_url}
                        category={row.category}
                        size="sm"
                      />
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
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
                          <RecipientAvatars
                            recipients={row.recipients}
                            className="mt-1 text-xs"
                          />
                        </div>
                        <span className="shrink-0 text-sm font-medium">
                          {toSwissDate(row.deadline_date)}
                        </span>
                      </div>
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
