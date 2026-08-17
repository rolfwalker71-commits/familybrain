"use client";

import { useMemo, type ReactNode } from "react";
import {
  ArrowLeftRight,
  CalendarRange,
  Clock3,
  Coins,
  ListOrdered,
  Tags,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { FinancePieCard } from "@/components/finance-brain/finance-pie-card";
import { formatDateDe, formatMoney, formatSignedMoney } from "@/lib/finance-brain/format";
import {
  buildCategoryBuckets,
  buildCurrencyNamedBuckets,
  buildMemberShareBuckets,
  buildOpenSettledSummary,
  buildPaidByBuckets,
  buildRecentActivity,
  buildTimelinePoints,
  buildTopExpenses,
  type OverviewBalance,
  type OverviewDebt,
  type OverviewExpense,
  type OverviewMember,
  type OverviewSettlement,
} from "@/lib/finance-brain/overview-dashboard";
import { cn } from "@/lib/utils";

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof CalendarRange;
  children: ReactNode;
}) {
  return (
    <Card
      size="sm"
      tone="green"
      className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
    >
      <CardHeader
        tone="green"
        className="flex flex-row items-center justify-between gap-2 py-1.5"
      >
        <CardTitle className="flex items-center gap-2 text-[15px]! text-[var(--brand-finance)]">
          <IconCircle icon={Icon} tone="green" size="sm" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

export function LedgerOverviewDashboards({
  expenses,
  settlements,
  members,
  openDebts,
  baseCurrency,
  balances = [],
  showMemberCharts = true,
  showOpenSettled = true,
  onOpenExpense,
}: {
  expenses: OverviewExpense[];
  settlements: OverviewSettlement[];
  members: OverviewMember[];
  openDebts: OverviewDebt[];
  baseCurrency: string;
  balances?: OverviewBalance[];
  showMemberCharts?: boolean;
  showOpenSettled?: boolean;
  onOpenExpense?: (expenseId: number) => void;
}) {
  const timeline = useMemo(() => buildTimelinePoints(expenses), [expenses]);
  const top = useMemo(
    () => buildTopExpenses(expenses, members, 8),
    [expenses, members]
  );
  const categories = useMemo(
    () => buildCategoryBuckets(expenses),
    [expenses]
  );
  const memberShares = useMemo(
    () => buildMemberShareBuckets(balances),
    [balances]
  );
  const paidBy = useMemo(
    () => buildPaidByBuckets(expenses, members),
    [expenses, members]
  );
  const currencies = useMemo(
    () => buildCurrencyNamedBuckets(expenses),
    [expenses]
  );
  const openSettled = useMemo(
    () => buildOpenSettledSummary(expenses, settlements, openDebts),
    [expenses, settlements, openDebts]
  );
  const recent = useMemo(
    () => buildRecentActivity(expenses, settlements, members, 6),
    [expenses, settlements, members]
  );

  const maxDay = Math.max(1, ...timeline.points.map((p) => p.totalBase));
  const maxCumulative = Math.max(
    1,
    ...timeline.points.map((p) => p.cumulativeBase)
  );

  if (expenses.length === 0 && settlements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <FinancePieCard
          title="Ausgaben nach Kategorien"
          icon={Tags}
          buckets={categories}
          baseCurrency={baseCurrency}
          legendVisual="category"
        />
        {showMemberCharts ? (
          <FinancePieCard
            title="Ausgaben nach Mitgliedern"
            icon={Users}
            buckets={memberShares}
            baseCurrency={baseCurrency}
            legendVisual="avatar"
          />
        ) : null}
        {showMemberCharts ? (
          <FinancePieCard
            title="Von Mitgliedern bezahlt"
            icon={UserRound}
            buckets={paidBy}
            baseCurrency={baseCurrency}
            legendVisual="avatar"
          />
        ) : null}
        <FinancePieCard
          title="Ausgaben nach Währungen"
          icon={Coins}
          buckets={currencies}
          baseCurrency={baseCurrency}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title={`Zeitverlauf (${timeline.mode === "week" ? "Woche" : "Tag"})`}
          icon={CalendarRange}
        >
          {timeline.points.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Ausgaben.</p>
          ) : (
            <ul className="space-y-1.5">
              {timeline.points.map((p) => (
                <li key={p.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm leading-snug">
                    <span className="min-w-0 truncate font-medium">{p.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatMoney(p.totalBase, baseCurrency)}
                      <span className="ml-1.5 text-[10px]">
                        Σ {formatMoney(p.cumulativeBase, baseCurrency)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[var(--brand-finance)]"
                        style={{
                          width: `${Math.max(3, (p.totalBase / maxDay) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="h-1.5 w-1/3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[var(--brand-finance)]/45"
                        style={{
                          width: `${Math.max(
                            3,
                            (p.cumulativeBase / maxCumulative) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] leading-tight text-muted-foreground">
            Dunkel = Periode, hell = kumuliert.
          </p>
        </Panel>

        <Panel title="Top-Ausgaben" icon={ListOrdered}>
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Ausgaben.</p>
          ) : (
            <ul className="space-y-1.5">
              {top.map((e, i) => (
                <li key={e.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto w-full items-baseline justify-between gap-2 rounded-lg px-1 py-0.5 text-left text-sm font-normal leading-snug",
                      onOpenExpense && "hover:bg-muted/50"
                    )}
                    onClick={() => onOpenExpense?.(e.id)}
                    disabled={!onOpenExpense}
                  >
                    <span className="min-w-0">
                      <span className="mr-1.5 tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="font-medium">{e.description}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {e.categoryLabel} · {e.payerName}
                        {e.expenseDate
                          ? ` · ${formatDateDe(e.expenseDate) || e.expenseDate}`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(e.amountBase, baseCurrency)}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {showOpenSettled ? (
          <Panel title="Offen vs. erledigt" icon={ArrowLeftRight}>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
                <p className="text-[11px] text-muted-foreground">Noch offen</p>
                <p className="text-base font-semibold tabular-nums text-rose-600">
                  {formatMoney(openSettled.openDebtBase, baseCurrency)}
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
                <p className="text-[11px] text-muted-foreground">Rückzahlungen</p>
                <p className="text-base font-semibold tabular-nums text-[var(--brand-finance)]">
                  {formatMoney(openSettled.settlementsBase, baseCurrency)}
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-white px-2.5 py-2">
                <p className="text-[11px] text-muted-foreground">Pre-settled</p>
                <p className="text-base font-semibold tabular-nums">
                  {formatMoney(openSettled.preSettledBase, baseCurrency)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Offen {openSettled.openDebtSharePct}%</span>
                <span>Rückz. {openSettled.settlementsSharePct}%</span>
                <span>Pre {openSettled.preSettledSharePct}%</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-rose-500/80"
                  style={{ width: `${openSettled.openDebtSharePct}%` }}
                />
                <div
                  className="bg-[var(--brand-finance)]"
                  style={{ width: `${openSettled.settlementsSharePct}%` }}
                />
                <div
                  className="bg-[var(--brand-finance)]/40"
                  style={{ width: `${openSettled.preSettledSharePct}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Anteile relativ zur Ausgabensumme{" "}
              {formatMoney(openSettled.totalSpentBase, baseCurrency)}.
            </p>
          </Panel>
        ) : null}

        <Panel title="Letzte Aktivität" icon={Clock3}>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Aktivität.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto w-full items-baseline justify-between gap-2 rounded-lg px-1 py-0.5 text-left text-sm font-normal leading-snug",
                      item.kind === "expense" &&
                        onOpenExpense &&
                        "hover:bg-muted/50"
                    )}
                    disabled={item.kind !== "expense" || !onOpenExpense}
                    onClick={() => {
                      if (item.kind === "expense") onOpenExpense?.(item.id);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{item.title}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {item.subtitle}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        item.signed && "text-[var(--brand-finance)]"
                      )}
                    >
                      {item.signed
                        ? formatSignedMoney(item.amountBase, baseCurrency)
                        : formatMoney(item.amountBase, baseCurrency)}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Jump into Ausgaben and highlight a card. */
export function scrollToExpenseCard(expenseId: number) {
  const el = document.getElementById(`expense-card-${expenseId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-[var(--brand-finance)]/40");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-[var(--brand-finance)]/40");
  }, 1600);
}
