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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardStats, listDeadlines } from "@/lib/db/queries";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { MetricGrid } from "@/components/layout/page-primitives";
import { DocumentInfoButton } from "@/components/documents/document-link";

export const dynamic = "force-dynamic";

const iconTone = {
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-500",
  orange: "bg-orange-50 text-orange-500",
  green: "bg-emerald-50 text-emerald-600",
  purple: "bg-blue-50 text-blue-600",
  teal: "bg-teal-50 text-teal-600",
} as const;

function StatCard({
  title,
  value,
  icon: Icon,
  tone,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof iconTone;
  href?: string;
}) {
  const content = (
    <Card className="h-full min-w-0 overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground" title={title}>
            {title}
          </p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            iconTone[tone]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="min-w-0">
      {content}
    </Link>
  ) : (
    content
  );
}

export default function DashboardPage() {
  const stats = getDashboardStats();
  const upcoming = (
    listDeadlines("open") as {
      id: number;
      title: string;
      deadline_date: string | null;
      deadline_type: string | null;
      document_local_id: number;
    }[]
  )
    .filter((d) => d.deadline_date)
    .slice(0, 5);

  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Überblick über deine Dokumente und Analysen
        </p>
      </div>

      <MetricGrid>
        <StatCard
          title="Dokumente synchronisiert"
          value={stats.totalDocuments}
          icon={FileText}
          tone="blue"
          href="/documents"
        />
        <StatCard
          title="Analyse ausstehend"
          value={stats.pendingAnalysis}
          icon={Clock3}
          tone="amber"
          href="/documents?analysisStatus=pending"
        />
        <StatCard
          title="Anstehende Fristen"
          value={stats.upcomingDeadlines}
          icon={CalendarDays}
          tone="rose"
          href="/deadlines"
        />
        <StatCard
          title="Garantien bald abgelaufen"
          value={stats.warrantiesExpiringSoon}
          icon={Shield}
          tone="orange"
          href="/warranties"
        />
        <StatCard
          title="Analysiert"
          value={stats.analyzed}
          icon={TrendingUp}
          tone="green"
          href="/summaries"
        />
        <StatCard
          title="Ausgaben dieses Jahr (ohne Unbekannt)"
          value={formatCHF(stats.financialTotalThisYear)}
          icon={Wallet}
          tone="purple"
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
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Zuletzt analysiert
            </CardTitle>
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
                    category: string | null;
                    short_summary: string | null;
                    analyzed_at: string | null;
                  };
                  return (
                    <div
                      key={row.id}
                      className="flex min-w-0 items-start gap-2 rounded-lg border border-border/70 p-3 transition-colors hover:bg-muted/50"
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

        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Nächste Fristen
            </CardTitle>
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
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 p-3 transition-colors hover:bg-muted/50"
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
                          {row.deadline_type || "Frist"}
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
