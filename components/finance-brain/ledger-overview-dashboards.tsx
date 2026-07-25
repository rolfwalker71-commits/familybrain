"use client";

import { useMemo, type ReactNode } from "react";
import {
  ArrowLeftRight,
  CalendarRange,
  Clock3,
  Coins,
  ListOrdered,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { formatMoney, formatSignedMoney } from "@/lib/finance-brain/format";
import {
  buildCurrencyBuckets,
  buildOpenSettledSummary,
  buildPersonCategoryMix,
  buildRecentActivity,
  buildTimelinePoints,
  buildTopExpenses,
  type OverviewDebt,
  type OverviewExpense,
  type OverviewMember,
  type OverviewSettlement,
} from "@/lib/finance-brain/overview-dashboard";
import { cn } from "@/lib/utils";

function ShareBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full bg-[var(--brand-finance)] transition-[width]",
          className
        )}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

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
  showPersonMix = true,
  showOpenSettled = true,
  onOpenExpense,
}: {
  expenses: OverviewExpense[];
  settlements: OverviewSettlement[];
  members: OverviewMember[];
  openDebts: OverviewDebt[];
  baseCurrency: string;
  showPersonMix?: boolean;
  showOpenSettled?: boolean;
  onOpenExpense?: (expenseId: number) => void;
}) {
  const timeline = useMemo(() => buildTimelinePoints(expenses), [expenses]);
  const top = useMemo(
    () => buildTopExpenses(expenses, members, 8),
    [expenses, members]
  );
  const currencies = useMemo(
    () => buildCurrencyBuckets(expenses),
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
  const personMix = useMemo(
    () => buildPersonCategoryMix(expenses, members, 4),
    [expenses, members]
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
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-baseline justify-between gap-2 rounded-lg px-1 py-0.5 text-left text-sm leading-snug",
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
                      {e.expenseDate ? ` · ${e.expenseDate}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(e.amountBase, baseCurrency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Währungen" icon={Coins}>
        {currencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Ausgaben.</p>
        ) : (
          <ul className="space-y-1.5">
            {currencies.map((c) => (
              <li key={c.currency}>
                <div className="flex items-baseline justify-between gap-2 text-sm leading-snug">
                  <span className="font-medium">{c.currency}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatMoney(c.amountBase, baseCurrency)}
                    <span className="ml-1.5 text-[10px]">{c.sharePct}%</span>
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {c.count} Buchung{c.count === 1 ? "" : "en"}
                  {c.currency !== baseCurrency.toUpperCase()
                    ? ` · FW ${formatMoney(c.amountOriginal, c.currency)}`
                    : ""}
                </p>
                <ShareBar value={c.sharePct} />
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
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-baseline justify-between gap-2 rounded-lg px-1 py-0.5 text-left text-sm leading-snug",
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {showPersonMix ? (
        <Panel title="Pro Person: Ausgaben-Mix" icon={Users}>
          {personMix.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Ausgaben.</p>
          ) : (
            <ul className="space-y-2.5">
              {personMix.map((p) => (
                <li key={p.memberId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{p.displayName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(p.paidBase, baseCurrency)}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {p.categories.map((c) => (
                      <li key={c.label}>
                        <div className="flex justify-between gap-2 text-[11px] leading-tight">
                          <span className="truncate text-muted-foreground">
                            {c.label}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {c.sharePct}%
                          </span>
                        </div>
                        <ShareBar value={c.sharePct} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
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
