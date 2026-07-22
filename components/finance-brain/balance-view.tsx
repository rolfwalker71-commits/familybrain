"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatSignedMoney } from "@/lib/finance-brain/format";
import { ExpenseReceiptControls } from "@/components/finance-brain/expense-receipt-controls";
import { cn } from "@/lib/utils";

type Balance = {
  memberId: number;
  displayName: string;
  paidBase: number;
  owedBase: number;
  settlementsReceivedBase: number;
  settlementsPaidBase: number;
  netBalance: number;
};

type Debt = {
  fromMemberId: number;
  fromDisplayName: string;
  toMemberId: number;
  toDisplayName: string;
  amount: number;
};

export function BalanceView({
  balances,
  simplifiedDebts,
  baseCurrency,
  highlightMemberId,
}: {
  balances: Balance[];
  simplifiedDebts: Debt[];
  baseCurrency: string;
  highlightMemberId?: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-md border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saldo pro Person</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Teilnehmer.</p>
          ) : (
            balances.map((b) => (
              <div
                key={b.memberId}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                  highlightMemberId === b.memberId
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60"
                )}
              >
                <span className="font-medium">{b.displayName}</span>
                <span
                  className={
                    b.netBalance > 0
                      ? "text-emerald-600"
                      : b.netBalance < 0
                        ? "text-rose-600"
                        : "text-muted-foreground"
                  }
                >
                  {formatSignedMoney(b.netBalance, baseCurrency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-md border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ausgleichsvorschläge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {simplifiedDebts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Alles ausgeglichen.</p>
          ) : (
            simplifiedDebts.map((d, i) => (
              <div
                key={`${d.fromMemberId}-${d.toMemberId}-${i}`}
                className="rounded-md border border-border/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{d.fromDisplayName}</span>
                {" schuldet "}
                <span className="font-medium">{d.toDisplayName}</span>
                {" "}
                <span className="text-foreground/80">
                  {formatMoney(d.amount, baseCurrency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ExpenseList({
  expenses,
  members,
  baseCurrency,
  onDelete,
  canDelete,
  receiptUploadUrl,
  onReceiptChanged,
}: {
  expenses: Array<{
    id: number;
    description: string | null;
    amount: number;
    currency: string;
    amount_base: number;
    expense_date: string | null;
    paid_by_member_id: number;
    receipt_url?: string | null;
    has_receipt?: boolean;
    splits: Array<{ member_id: number; share_amount_base: number }>;
  }>;
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  receiptUploadUrl?: (expenseId: number) => string;
  onReceiptChanged?: () => void;
}) {
  const memberName = (id: number) =>
    members.find((m) => m.id === id)?.display_name ?? `#${id}`;

  return (
    <div className="space-y-2">
      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Ausgaben.</p>
      ) : (
        expenses.map((exp) => (
          <div
            key={exp.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {exp.description || "Ausgabe"}
                {exp.expense_date ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {exp.expense_date}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Bezahlt von {memberName(exp.paid_by_member_id)} ·{" "}
                {formatMoney(exp.amount, exp.currency)}
                {exp.currency !== baseCurrency
                  ? ` (${formatMoney(exp.amount_base, baseCurrency)})`
                  : ""}
              </p>
              {receiptUploadUrl ? (
                <ExpenseReceiptControls
                  expenseId={exp.id}
                  receiptUrl={exp.receipt_url}
                  uploadUrl={receiptUploadUrl(exp.id)}
                  onChanged={onReceiptChanged}
                  compact
                />
              ) : exp.receipt_url ? (
                <a
                  href={exp.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={exp.receipt_url}
                    alt="Beleg"
                    className="h-10 w-10 rounded border border-border/60 object-cover"
                  />
                </a>
              ) : null}
            </div>
            {canDelete && onDelete ? (
              <button
                type="button"
                className="text-xs text-destructive hover:underline"
                onClick={() => onDelete(exp.id)}
              >
                Löschen
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

export function SettlementList({
  settlements,
  members,
  baseCurrency,
}: {
  settlements: Array<{
    id: number;
    from_member_id: number;
    to_member_id: number;
    amount: number;
    currency: string;
    amount_base: number;
    note: string | null;
    settled_at: string;
  }>;
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
}) {
  const memberName = (id: number) =>
    members.find((m) => m.id === id)?.display_name ?? `#${id}`;

  return (
    <div className="space-y-2">
      {settlements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rückzahlungen.</p>
      ) : (
        settlements.map((s) => (
          <div
            key={s.id}
            className="rounded-md border border-border/60 px-3 py-2 text-sm"
          >
            <p>
              <span className="font-medium">{memberName(s.from_member_id)}</span>
              {" → "}
              <span className="font-medium">{memberName(s.to_member_id)}</span>
              {": "}
              {formatMoney(s.amount, s.currency)}
              {s.currency !== baseCurrency
                ? ` (${formatMoney(s.amount_base, baseCurrency)})`
                : ""}
            </p>
            {s.note ? (
              <p className="text-xs text-muted-foreground">{s.note}</p>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="rounded-md border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
