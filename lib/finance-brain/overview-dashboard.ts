import { roundMoney } from "@/lib/finance-brain/settlement";
import { expenseVisualForExpense } from "@/lib/finance-brain/expense-category";

export type OverviewExpense = {
  id: number;
  description: string | null;
  amount: number;
  currency: string;
  amount_base: number;
  expense_date: string | null;
  paid_by_member_id: number;
  direction?: "expense" | "income";
  category_label?: string | null;
  category_tone?: string | null;
  place_name?: string | null;
  pre_settled?: number | boolean;
  created_at?: string;
};

export type OverviewSettlement = {
  id: number;
  from_member_id: number;
  to_member_id: number;
  amount_base: number;
  settled_at: string;
  note: string | null;
};

export type OverviewMember = {
  id: number;
  display_name: string;
};

export type OverviewDebt = {
  amount: number;
};

export type TimelinePoint = {
  key: string;
  label: string;
  totalBase: number;
  cumulativeBase: number;
  count: number;
};

export type TopExpenseRow = {
  id: number;
  description: string;
  categoryLabel: string;
  payerName: string;
  amountBase: number;
  expenseDate: string | null;
};

export type CurrencyBucket = {
  currency: string;
  amountOriginal: number;
  amountBase: number;
  count: number;
  sharePct: number;
};

/** Generic named slice for pie charts (category / member / currency). */
export type NamedAmountBucket = {
  key: string;
  label: string;
  amountBase: number;
  count: number;
  sharePct: number;
};

export type OverviewBalance = {
  memberId: number;
  displayName: string;
  paidBase: number;
  owedBase: number;
};

export type OpenSettledSummary = {
  totalSpentBase: number;
  openDebtBase: number;
  settlementsBase: number;
  preSettledBase: number;
  openDebtSharePct: number;
  settlementsSharePct: number;
  preSettledSharePct: number;
};

export type RecentActivityItem = {
  kind: "expense" | "settlement";
  id: number;
  title: string;
  subtitle: string;
  amountBase: number;
  at: string;
  signed: boolean;
};

export type PersonCategoryMix = {
  memberId: number;
  displayName: string;
  paidBase: number;
  categories: Array<{
    label: string;
    totalBase: number;
    sharePct: number;
  }>;
};

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 1000) / 10);
}

function isoDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/);
  return m ? m[0] : null;
}

function weekKey(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = (date.getDay() + 6) % 7; // Mon=0
  date.setDate(date.getDate() - day);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatWeekLabel(isoMonday: string): string {
  return `KW ab ${formatDayLabel(isoMonday)}`;
}

function onlyExpenses(expenses: OverviewExpense[]): OverviewExpense[] {
  return expenses.filter((e) => (e.direction || "expense") !== "income");
}

export function buildTimelinePoints(
  expenses: OverviewExpense[]
): { mode: "day" | "week"; points: TimelinePoint[] } {
  const rows = onlyExpenses(expenses);
  const byDay = new Map<string, { total: number; count: number }>();
  for (const e of rows) {
    const day = isoDay(e.expense_date) || isoDay(e.created_at) || "ohne-datum";
    const entry = byDay.get(day) || { total: 0, count: 0 };
    entry.total += Number(e.amount_base) || 0;
    entry.count += 1;
    byDay.set(day, entry);
  }

  const datedKeys = [...byDay.keys()]
    .filter((k) => k !== "ohne-datum")
    .sort();
  const spanDays =
    datedKeys.length >= 2
      ? Math.max(
          1,
          Math.round(
            (Date.parse(datedKeys[datedKeys.length - 1]!) -
              Date.parse(datedKeys[0]!)) /
              86_400_000
          )
        )
      : datedKeys.length;
  const useWeek = spanDays > 21 || datedKeys.length > 18;

  const buckets = new Map<string, { total: number; count: number }>();
  for (const [day, v] of byDay) {
    const key = day === "ohne-datum" ? "ohne-datum" : useWeek ? weekKey(day) : day;
    const entry = buckets.get(key) || { total: 0, count: 0 };
    entry.total += v.total;
    entry.count += v.count;
    buckets.set(key, entry);
  }

  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === "ohne-datum") return 1;
    if (b === "ohne-datum") return -1;
    return a.localeCompare(b);
  });

  let cumulative = 0;
  const points: TimelinePoint[] = keys.map((key) => {
    const v = buckets.get(key)!;
    cumulative += v.total;
    return {
      key,
      label:
        key === "ohne-datum"
          ? "Ohne Datum"
          : useWeek
            ? formatWeekLabel(key)
            : formatDayLabel(key),
      totalBase: roundMoney(v.total),
      cumulativeBase: roundMoney(cumulative),
      count: v.count,
    };
  });

  return { mode: useWeek ? "week" : "day", points };
}

export function buildTopExpenses(
  expenses: OverviewExpense[],
  members: OverviewMember[],
  limit = 8
): TopExpenseRow[] {
  const nameOf = (id: number) =>
    members.find((m) => m.id === id)?.display_name || `#${id}`;
  return onlyExpenses(expenses)
    .slice()
    .sort(
      (a, b) =>
        (Number(b.amount_base) || 0) - (Number(a.amount_base) || 0) ||
        b.id - a.id
    )
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      description: e.description?.trim() || "Ausgabe",
      categoryLabel: expenseVisualForExpense(e).label,
      payerName: nameOf(e.paid_by_member_id),
      amountBase: roundMoney(Number(e.amount_base) || 0),
      expenseDate: isoDay(e.expense_date),
    }));
}

export function buildCurrencyBuckets(
  expenses: OverviewExpense[]
): CurrencyBucket[] {
  const rows = onlyExpenses(expenses);
  const map = new Map<
    string,
    { amountOriginal: number; amountBase: number; count: number }
  >();
  let totalBase = 0;
  for (const e of rows) {
    const cur = (e.currency || "CHF").toUpperCase();
    const entry = map.get(cur) || {
      amountOriginal: 0,
      amountBase: 0,
      count: 0,
    };
    entry.amountOriginal += Number(e.amount) || 0;
    entry.amountBase += Number(e.amount_base) || 0;
    entry.count += 1;
    map.set(cur, entry);
    totalBase += Number(e.amount_base) || 0;
  }
  totalBase = roundMoney(totalBase);
  return [...map.entries()]
    .map(([currency, v]) => ({
      currency,
      amountOriginal: roundMoney(v.amountOriginal),
      amountBase: roundMoney(v.amountBase),
      count: v.count,
      sharePct: pct(v.amountBase, totalBase),
    }))
    .sort(
      (a, b) =>
        b.amountBase - a.amountBase || a.currency.localeCompare(b.currency)
    );
}

function sortNamedBuckets(buckets: NamedAmountBucket[]): NamedAmountBucket[] {
  return buckets.sort(
    (a, b) =>
      b.amountBase - a.amountBase ||
      a.label.localeCompare(b.label, "de")
  );
}

/** Ausgaben nach Kategorie (Settle Up: «Ausgaben nach Kategorien»). */
export function buildCategoryBuckets(
  expenses: OverviewExpense[]
): NamedAmountBucket[] {
  const rows = onlyExpenses(expenses);
  const map = new Map<string, { amountBase: number; count: number }>();
  let totalBase = 0;
  for (const e of rows) {
    const label = expenseVisualForExpense(e).label || "Keine Kategorie";
    const entry = map.get(label) || { amountBase: 0, count: 0 };
    const amount = Number(e.amount_base) || 0;
    entry.amountBase += amount;
    entry.count += 1;
    map.set(label, entry);
    totalBase += amount;
  }
  totalBase = roundMoney(totalBase);
  return sortNamedBuckets(
    [...map.entries()].map(([label, v]) => ({
      key: label,
      label,
      amountBase: roundMoney(v.amountBase),
      count: v.count,
      sharePct: pct(v.amountBase, totalBase),
    }))
  );
}

/** Wer hat bezahlt (Settle Up: «Von Mitgliedern bezahlt»). */
export function buildPaidByBuckets(
  expenses: OverviewExpense[],
  members: OverviewMember[]
): NamedAmountBucket[] {
  const nameOf = (id: number) =>
    members.find((m) => m.id === id)?.display_name || `#${id}`;
  const rows = onlyExpenses(expenses);
  const map = new Map<number, { amountBase: number; count: number }>();
  let totalBase = 0;
  for (const e of rows) {
    const entry = map.get(e.paid_by_member_id) || {
      amountBase: 0,
      count: 0,
    };
    const amount = Number(e.amount_base) || 0;
    entry.amountBase += amount;
    entry.count += 1;
    map.set(e.paid_by_member_id, entry);
    totalBase += amount;
  }
  totalBase = roundMoney(totalBase);
  return sortNamedBuckets(
    [...map.entries()].map(([memberId, v]) => ({
      key: String(memberId),
      label: nameOf(memberId),
      amountBase: roundMoney(v.amountBase),
      count: v.count,
      sharePct: pct(v.amountBase, totalBase),
    }))
  );
}

/**
 * Ausgabenanteile je Mitglied (Settle Up: «Ausgaben nach Mitgliedern»).
 * Nutzt die fairen Anteile (owedBase) aus den Salden.
 */
export function buildMemberShareBuckets(
  balances: OverviewBalance[]
): NamedAmountBucket[] {
  const totalBase = roundMoney(
    balances.reduce((s, b) => s + (Number(b.owedBase) || 0), 0)
  );
  return sortNamedBuckets(
    balances
      .filter((b) => (Number(b.owedBase) || 0) > 0)
      .map((b) => ({
        key: String(b.memberId),
        label: b.displayName,
        amountBase: roundMoney(Number(b.owedBase) || 0),
        count: 0,
        sharePct: pct(Number(b.owedBase) || 0, totalBase),
      }))
  );
}

/** Währungs-Buckets als NamedAmountBucket für Pie-Charts. */
export function buildCurrencyNamedBuckets(
  expenses: OverviewExpense[]
): NamedAmountBucket[] {
  return buildCurrencyBuckets(expenses).map((c) => ({
    key: c.currency,
    label: c.currency,
    amountBase: c.amountBase,
    count: c.count,
    sharePct: c.sharePct,
  }));
}

export function buildOpenSettledSummary(
  expenses: OverviewExpense[],
  settlements: OverviewSettlement[],
  openDebts: OverviewDebt[]
): OpenSettledSummary {
  const rows = onlyExpenses(expenses);
  const totalSpentBase = roundMoney(
    rows.reduce((s, e) => s + (Number(e.amount_base) || 0), 0)
  );
  const settlementsBase = roundMoney(
    settlements.reduce((s, x) => s + (Number(x.amount_base) || 0), 0)
  );
  const preSettledBase = roundMoney(
    rows
      .filter((e) => Boolean(e.pre_settled))
      .reduce((s, e) => s + (Number(e.amount_base) || 0), 0)
  );
  const openDebtBase = roundMoney(
    openDebts.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  );
  const denom = Math.max(totalSpentBase, 1);
  return {
    totalSpentBase,
    openDebtBase,
    settlementsBase,
    preSettledBase,
    openDebtSharePct: pct(openDebtBase, denom),
    settlementsSharePct: pct(settlementsBase, denom),
    preSettledSharePct: pct(preSettledBase, denom),
  };
}

export function buildRecentActivity(
  expenses: OverviewExpense[],
  settlements: OverviewSettlement[],
  members: OverviewMember[],
  limit = 6
): RecentActivityItem[] {
  const nameOf = (id: number) =>
    members.find((m) => m.id === id)?.display_name || `#${id}`;
  const items: RecentActivityItem[] = [];

  for (const e of expenses) {
    const isIncome = e.direction === "income";
    const at =
      e.created_at ||
      (e.expense_date ? `${e.expense_date}T12:00:00` : "") ||
      "";
    if (!at) continue;
    items.push({
      kind: "expense",
      id: e.id,
      title: e.description?.trim() || (isIncome ? "Einnahme" : "Ausgabe"),
      subtitle: `${expenseVisualForExpense(e).label} · ${nameOf(e.paid_by_member_id)}`,
      amountBase: roundMoney(Number(e.amount_base) || 0),
      at,
      signed: isIncome,
    });
  }

  for (const s of settlements) {
    items.push({
      kind: "settlement",
      id: s.id,
      title: `Rückzahlung ${nameOf(s.from_member_id)} → ${nameOf(s.to_member_id)}`,
      subtitle: s.note?.trim() || "Ausgleich",
      amountBase: roundMoney(Number(s.amount_base) || 0),
      at: s.settled_at,
      signed: false,
    });
  }

  return items
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
    .slice(0, limit);
}

export function buildPersonCategoryMix(
  expenses: OverviewExpense[],
  members: OverviewMember[],
  topN = 4
): PersonCategoryMix[] {
  const rows = onlyExpenses(expenses);
  const byMember = new Map<
    number,
    { paid: number; cats: Map<string, number> }
  >();

  for (const e of rows) {
    const entry = byMember.get(e.paid_by_member_id) || {
      paid: 0,
      cats: new Map<string, number>(),
    };
    const amount = Number(e.amount_base) || 0;
    entry.paid += amount;
    const label = expenseVisualForExpense(e).label;
    entry.cats.set(label, (entry.cats.get(label) || 0) + amount);
    byMember.set(e.paid_by_member_id, entry);
  }

  return members
    .map((m) => {
      const entry = byMember.get(m.id) || {
        paid: 0,
        cats: new Map<string, number>(),
      };
      const paidBase = roundMoney(entry.paid);
      const categories = [...entry.cats.entries()]
        .map(([label, total]) => ({
          label,
          totalBase: roundMoney(total),
          sharePct: pct(total, paidBase),
        }))
        .sort((a, b) => b.totalBase - a.totalBase || a.label.localeCompare(b.label, "de"))
        .slice(0, topN);
      return {
        memberId: m.id,
        displayName: m.display_name,
        paidBase,
        categories,
      };
    })
    .filter((p) => p.paidBase > 0)
    .sort((a, b) => b.paidBase - a.paidBase || a.displayName.localeCompare(b.displayName, "de"));
}
