"use client";

import { useMemo, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Download,
  Filter,
  FileText,
  Link2,
  Luggage,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Scale,
  Search,
  Trash2,
  Unlink,
  Users,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ListSortControl,
  useListSortDir,
} from "@/components/layout/list-sort-control";
import { compareNullableDate } from "@/lib/utils/list-sort";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDateDe,
  formatExchangeRateLine,
  formatMoney,
  formatMoneyFxSummary,
  formatSignedMoney,
} from "@/lib/finance-brain/format";
import {
  COMMON_CURRENCIES,
  expenseSettledBadge,
  EXPENSE_SETTLED_STATUS,
  isExpenseSettled,
} from "@/lib/finance-brain/constants";
import {
  expenseVisualForExpense,
  settlementVisual,
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/finance-brain/expense-category";
import {
  ExpenseReceiptControls,
  type ExpenseReceiptControlsHandle,
} from "@/components/finance-brain/expense-receipt-controls";
import {
  IconCircle,
  type IconTone,
} from "@/components/layout/icon-circle";
import { toIsoDateOnly } from "@/components/layout/calendar-date-badge";
import {
  DateTimelineStrip,
  uniqueSortedIsoDates,
  stickyStripClass,
} from "@/components/layout/date-timeline-strip";
import { useIsStandalonePwa } from "@/hooks/use-standalone-pwa";
import { useActiveDateFromScroll } from "@/hooks/use-active-date-from-scroll";
import { LinkPaperlessDocumentDialog } from "@/components/finance-brain/link-paperless-document-dialog";
import {
  ExpenseTripEventPicker,
  type TripPickerOption,
} from "@/components/finance-brain/expense-trip-event-picker";
import {
  ExpenseSplitParticipants,
  coercePayerId,
  eligiblePayerIdsFromSplit,
  type ExpenseSplitSelection,
} from "@/components/finance-brain/expense-split-participants";
import { cn } from "@/lib/utils";
import { NameWithAvatar, UserAvatar } from "@/components/users/user-avatar";
import { AiImagePreview } from "@/components/layout/ai-image-preview";
import { DetailCarousel } from "@/components/layout/detail-carousel";
import { ActivityLogPanel } from "@/components/activity/activity-log-panel";
import { SettlementAuditPanel } from "@/components/finance-brain/settlement-audit-panel";
import { explainSimplifyDebts } from "@/lib/finance-brain/settlement";

type Balance = {
  memberId: number;
  displayName: string;
  avatarUrl?: string | null;
  paidBase: number;
  owedBase: number;
  settlementsReceivedBase: number;
  settlementsPaidBase: number;
  netBalance: number;
};

type CoupleBalance = {
  coupleId: number;
  name: string;
  memberIds: number[];
  paidBase: number;
  owedBase: number;
  settlementsPaidBase: number;
  settlementsReceivedBase: number;
  netBalance: number;
};

type Debt = {
  fromMemberId: number;
  fromDisplayName: string;
  fromAvatarUrl?: string | null;
  toMemberId: number;
  toDisplayName: string;
  toAvatarUrl?: string | null;
  amount: number;
};

type CoupleDebt = Debt & {
  fromCoupleId: number;
  fromCoupleName: string;
  toCoupleId: number;
  toCoupleName: string;
};

export type ExpenseListItem = {
  id: number;
  description: string | null;
  amount: number;
  currency: string;
  exchange_rate?: number;
  amount_base: number;
  expense_date: string | null;
  paid_by_member_id: number;
  direction?: "expense" | "income";
  category_label?: string | null;
  category_tone?: string | null;
  place_name?: string | null;
  place_lat?: number | null;
  place_lon?: number | null;
  note?: string | null;
  receipt_url?: string | null;
  has_receipt?: boolean;
  ai_image_url?: string | null;
  has_ai_image?: boolean;
  document_id?: number | null;
  document?: {
    id: number;
    paperless_id: number;
    title: string | null;
    original_file_name?: string | null;
  } | null;
  trip_event_id?: number | null;
  trip_event?: {
    id: number;
    trip_id: number;
    trip_title: string | null;
    title: string;
    start_date: string | null;
    start_time: string | null;
  } | null;
  /** Backfilled expense that was already settled outside the app. */
  pre_settled?: number | boolean;
  splits: Array<{ member_id: number; share_amount_base: number }>;
};

export type ExpenseEditPayload = {
  description: string | null;
  expenseDate: string | null;
  paidByMemberId: number;
  place: string | null;
  note: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  direction?: "expense" | "income";
  tripEventId?: number | null;
  categoryLabel?: string;
  split?: ExpenseSplitSelection;
};

export type BalanceDebt = Debt;

export type CoupleSettlePreview = {
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  amountBase: number;
};

/** Client-side: exactly one couple, two positive shares, payer is one of them. */
export function coupleSettlePreviewForExpense(
  exp: ExpenseListItem,
  members: Array<{ id: number; display_name: string }>,
  couples: Array<{ id: number; name: string; memberIds: number[] }>
): CoupleSettlePreview | null {
  if ((exp.direction || "expense") === "income") return null;
  if (Number(exp.pre_settled) !== EXPENSE_SETTLED_STATUS.open) return null;
  const positive = exp.splits.filter((s) => Number(s.share_amount_base) > 0.004);
  if (positive.length !== 2) return null;
  const payerId = exp.paid_by_member_id;
  const partner = positive.find((s) => s.member_id !== payerId);
  const payerShare = positive.find((s) => s.member_id === payerId);
  if (!partner || !payerShare) return null;
  const couple = couples.find(
    (c) =>
      c.memberIds.includes(payerId) && c.memberIds.includes(partner.member_id)
  );
  if (!couple) return null;
  const fromName =
    members.find((m) => m.id === partner.member_id)?.display_name ||
    `#${partner.member_id}`;
  const toName =
    members.find((m) => m.id === payerId)?.display_name || `#${payerId}`;
  return {
    fromMemberId: partner.member_id,
    fromName,
    toMemberId: payerId,
    toName,
    amountBase: Number(partner.share_amount_base) || 0,
  };
}

export function BalanceView({
  balances,
  simplifiedDebts,
  minimalDebts = [],
  coupleBalances = [],
  coupleDebts = [],
  expenses = [],
  settlements = [],
  baseCurrency,
  highlightMemberId,
  onRecordDebt,
  canRecordDebt,
  recordBusyKey,
}: {
  balances: Balance[];
  /** Nach Zahler / Person (Anteil an dessen Ausgaben). */
  simplifiedDebts: Debt[];
  /** Wenigste Überweisungen bis alle Saldi null sind. */
  minimalDebts?: Debt[];
  coupleBalances?: CoupleBalance[];
  coupleDebts?: CoupleDebt[];
  /** Für Prüfen-Matrix (Buchung × Teilnehmer). */
  expenses?: ExpenseListItem[];
  /** Für Zell-Aufschlüsselung Wer→wem. */
  settlements?: Array<{
    id: number;
    from_member_id: number;
    to_member_id: number;
    amount_base: number;
    note: string | null;
  }>;
  baseCurrency: string;
  highlightMemberId?: number;
  onRecordDebt?: (debt: Debt) => void | Promise<void>;
  canRecordDebt?: (debt: Debt) => boolean;
  recordBusyKey?: string | null;
}) {
  const [minExplainOpen, setMinExplainOpen] = useState(false);
  const [extraPanel, setExtraPanel] = useState<
    "payer" | "couples" | "coupleTransfers" | null
  >(null);

  function debtKey(prefix: string, d: Debt, i: number) {
    return `${prefix}-${d.fromMemberId}-${d.toMemberId}-${i}`;
  }

  const minTransfersExplain = useMemo(
    () =>
      explainSimplifyDebts(
        balances.map((b) => ({
          memberId: b.memberId,
          displayName: b.displayName,
          paidBase: b.paidBase,
          owedBase: b.owedBase,
          settlementsReceivedBase: b.settlementsReceivedBase,
          settlementsPaidBase: b.settlementsPaidBase,
          net: b.netBalance,
        }))
      ),
    [balances]
  );

  const avatarByMemberId = useMemo(() => {
    const map = new Map<number, string | null | undefined>();
    for (const b of balances) map.set(b.memberId, b.avatarUrl);
    return map;
  }, [balances]);

  function renderDebtRow(prefix: string, d: Debt, i: number) {
    const key = debtKey(prefix, d, i);
    const debtId = `${d.fromMemberId}-${d.toMemberId}`;
    const showRecord =
      onRecordDebt && (canRecordDebt ? canRecordDebt(d) : true);
    const busy =
      recordBusyKey === key ||
      recordBusyKey === debtId ||
      recordBusyKey === `debt-${debtId}`;
    return (
      <div
        key={key}
        className="flex items-center gap-3 rounded-lg border border-amber-200/60 bg-white px-2.5 py-1.5 text-sm leading-snug"
      >
        <div className="flex min-w-0 flex-1 items-center gap-x-1 gap-y-0.5">
          <NameWithAvatar
            name={d.fromDisplayName}
            src={d.fromAvatarUrl}
            size="xs"
            nameClassName="font-medium"
          />
          <span className="text-muted-foreground" aria-hidden>
            →
          </span>
          <NameWithAvatar
            name={d.toDisplayName}
            src={d.toAvatarUrl}
            size="xs"
            nameClassName="font-medium"
          />
        </div>
        <span className="shrink-0 text-right font-semibold tabular-nums text-amber-900">
          {formatMoney(d.amount, baseCurrency)}
        </span>
        {showRecord ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 shrink-0 px-2 text-[0.6875rem]"
            disabled={busy || Boolean(recordBusyKey)}
            onClick={() => void onRecordDebt?.(d)}
          >
            {busy ? "…" : "Erfassen"}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
    <div className="mb-3 flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-1.5" />}
        >
          <MoreHorizontal className="size-4" />
          Mehr Auswertungen
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setExtraPanel("payer")}>
            <ArrowLeftRight className="size-4" />
            Nach Zahler
          </DropdownMenuItem>
          {coupleBalances.length > 0 ? (
            <DropdownMenuItem onClick={() => setExtraPanel("couples")}>
              <Users className="size-4" />
              Saldo je Paar
            </DropdownMenuItem>
          ) : null}
          {coupleBalances.length > 0 ? (
            <DropdownMenuItem
              onClick={() => setExtraPanel("coupleTransfers")}
            >
              <ArrowLeftRight className="size-4" />
              Ausgleich zwischen Paaren
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <Card
        size="sm"
        tone="green"
        className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
      >
        <CardHeader tone="green" className="py-1.5">
          <CardTitle className="flex items-center gap-2 text-[0.9375rem]! text-[var(--brand-finance)]">
            <IconCircle icon={Scale} tone="green" size="sm" />
            Saldo pro Person
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Teilnehmer.</p>
          ) : (
            <>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                Netto = bezahlt − Anteil (+ Rückzahlungen). Plus = Guthaben,
                Minus = Schuld.
              </p>
              {balances.map((b) => (
                <div
                  key={b.memberId}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm leading-snug",
                    highlightMemberId === b.memberId
                      ? "border-[var(--brand-finance)]/35 bg-[var(--brand-finance-soft)]/60"
                      : "border-border/50 bg-white"
                  )}
                >
                  <div className="min-w-0">
                    <NameWithAvatar
                      name={b.displayName}
                      src={b.avatarUrl}
                      size="sm"
                      nameClassName="font-medium"
                    />
                    <div className="mt-0.5 truncate text-[0.625rem] leading-tight text-muted-foreground">
                      bezahlt {formatMoney(b.paidBase, baseCurrency)}
                      {" · "}
                      Anteil {formatMoney(b.owedBase, baseCurrency)}
                      {b.settlementsPaidBase > 0
                        ? ` · Rückz. gezahlt ${formatMoney(b.settlementsPaidBase, baseCurrency)}`
                        : ""}
                      {b.settlementsReceivedBase > 0
                        ? ` · Rückz. erhalten ${formatMoney(b.settlementsReceivedBase, baseCurrency)}`
                        : ""}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      b.netBalance > 0
                        ? "text-[var(--brand-finance)]"
                        : b.netBalance < 0
                          ? "text-rose-600"
                          : "text-muted-foreground"
                    )}
                  >
                    {formatSignedMoney(b.netBalance, baseCurrency)}
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card
        size="sm"
        tone="green"
        className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
      >
        <CardHeader tone="green" className="py-1.5">
          <CardTitle className="flex items-center gap-2 text-[0.9375rem]! text-amber-900">
            <IconCircle icon={ArrowLeftRight} tone="green" size="sm" />
            Wenigste Überweisungen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {minimalDebts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Alles ausgeglichen.</p>
          ) : (
            <>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                Minimale Transfers aus dem Netto-Saldo bis alle ausgeglichen
                sind.
              </p>
              {minimalDebts.map((d, i) => renderDebtRow("min", d, i))}
              <div className="border-t border-border/40 pt-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[0.6875rem] font-medium text-[var(--brand-finance)] hover:bg-muted/40"
                  aria-expanded={minExplainOpen}
                  onClick={() => setMinExplainOpen((o) => !o)}
                >
                  <span>Aufschlüsselung</span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 transition-transform",
                      minExplainOpen && "rotate-180"
                    )}
                  />
                </Button>
                {minExplainOpen ? (
                  <div className="mt-1.5 space-y-2.5 rounded-lg border border-border/50 bg-muted/15 px-2.5 py-2">
                    <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                      Nicht aus einzelnen Buchungen, sondern aus dem
                      Netto-Saldo (siehe «Saldo pro Person»). Schuldner und
                      Gläubiger werden nacheinander mit{" "}
                      <span className="font-medium text-foreground">
                        min(Schuld, Guthaben)
                      </span>{" "}
                      verrechnet.
                    </p>
                    <div>
                      <p className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        1. Ausgangslage
                      </p>
                      <ul className="space-y-1">
                        {minTransfersExplain.openings.map((o) => (
                          <li
                            key={o.memberId}
                            className="flex items-center justify-between gap-2 text-xs leading-snug"
                          >
                            <NameWithAvatar
                              name={o.displayName}
                              src={avatarByMemberId.get(o.memberId)}
                              size="xs"
                              nameClassName="font-medium"
                            />
                            <span
                              className={cn(
                                "shrink-0 tabular-nums font-semibold",
                                o.role === "creditor"
                                  ? "text-[var(--brand-finance)]"
                                  : o.role === "debtor"
                                    ? "text-rose-600"
                                    : "text-muted-foreground"
                              )}
                            >
                              {formatSignedMoney(o.net, baseCurrency)}
                              <span className="ml-1 font-normal text-muted-foreground">
                                {o.role === "creditor"
                                  ? "Guthaben"
                                  : o.role === "debtor"
                                    ? "Schuld"
                                    : "ausgeglichen"}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        2. Matching-Schritte
                      </p>
                      {minTransfersExplain.steps.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Keine Transfers nötig.
                        </p>
                      ) : (
                        <ol className="space-y-1.5">
                          {minTransfersExplain.steps.map((s) => (
                            <li
                              key={`${s.step}-${s.fromMemberId}-${s.toMemberId}`}
                              className="rounded-md border border-border/40 bg-white px-2 py-1.5 text-xs leading-snug"
                            >
                              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                <span className="tabular-nums text-muted-foreground">
                                  {s.step}.
                                </span>
                                <NameWithAvatar
                                  name={s.fromName}
                                  src={avatarByMemberId.get(s.fromMemberId)}
                                  size="xs"
                                  nameClassName="font-medium"
                                />
                                <span className="text-muted-foreground" aria-hidden>
                                  →
                                </span>
                                <NameWithAvatar
                                  name={s.toName}
                                  src={avatarByMemberId.get(s.toMemberId)}
                                  size="xs"
                                  nameClassName="font-medium"
                                />
                                <span className="font-semibold tabular-nums text-amber-900">
                                  {formatMoney(s.amount, baseCurrency)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
                                Rest Schuld {s.fromName}:{" "}
                                {formatMoney(s.debtorRemaining, baseCurrency)}
                                {" · "}
                                Rest Guthaben {s.toName}:{" "}
                                {formatMoney(
                                  s.creditorRemaining,
                                  baseCurrency
                                )}
                              </p>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

    </div>

      <Dialog
        open={extraPanel !== null}
        onOpenChange={(open) => {
          if (!open) setExtraPanel(null);
        }}
      >
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>
              {extraPanel === "payer"
                ? "Nach Zahler"
                : extraPanel === "couples"
                  ? "Saldo je Paar"
                  : extraPanel === "coupleTransfers"
                    ? "Ausgleich zwischen Paaren"
                    : "Auswertung"}
            </DialogTitle>
            <DialogDescription>
              Zusätzliche Finanz-Auswertung als Overlay.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto px-4 pb-4">
            {extraPanel === "payer" ? (
              <Card
                size="sm"
                tone="green"
                className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
              >
                <CardHeader tone="green" className="py-1.5">
                  <CardTitle className="flex items-center gap-2 text-[0.9375rem]! text-amber-900">
                    <IconCircle icon={ArrowLeftRight} tone="green" size="sm" />
                    Nach Zahler
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {simplifiedDebts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Alles ausgeglichen.
                    </p>
                  ) : (
                    <>
                      <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                        Anteil an Ausgaben des Zahlers (Rückzahlungen /
                        Gegenforderungen verrechnet).
                      </p>
                      {simplifiedDebts.map((d, i) =>
                        renderDebtRow("payer-dialog", d, i)
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {extraPanel === "couples" ? (
              <Card
                size="sm"
                tone="green"
                className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
              >
                <CardHeader tone="green" className="py-1.5">
                  <CardTitle className="flex items-center gap-2 text-[0.9375rem]! text-[var(--brand-finance)]">
                    <IconCircle icon={Users} tone="green" size="sm" />
                    Saldo je Paar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                    Summe der Personen-Salden im Paar.
                  </p>
                  {coupleBalances.map((b) => (
                    <div
                      key={b.coupleId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-white px-2.5 py-1.5 text-sm leading-snug"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{b.name}</div>
                        <div className="mt-0.5 truncate text-[0.625rem] leading-tight text-muted-foreground">
                          bezahlt {formatMoney(b.paidBase, baseCurrency)}
                          {" · "}
                          Anteil {formatMoney(b.owedBase, baseCurrency)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 font-semibold tabular-nums",
                          b.netBalance > 0
                            ? "text-[var(--brand-finance)]"
                            : b.netBalance < 0
                              ? "text-rose-600"
                              : "text-muted-foreground"
                        )}
                      >
                        {formatSignedMoney(b.netBalance, baseCurrency)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {extraPanel === "coupleTransfers" ? (
              <Card
                size="sm"
                tone="green"
                className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
              >
                <CardHeader tone="green" className="py-1.5">
                  <CardTitle className="flex items-center gap-2 text-[0.9375rem]! text-amber-900">
                    <IconCircle icon={ArrowLeftRight} tone="green" size="sm" />
                    Ausgleich zwischen Paaren
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {coupleDebts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Paare sind ausgeglichen.
                    </p>
                  ) : (
                    <>
                      <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                        Vorschlag zwischen Paaren (Erfassen = Rückzahlung der
                        Vertreter).
                      </p>
                      {coupleDebts.map((d, i) =>
                        renderDebtRow(
                          "couple-dialog",
                          {
                            fromMemberId: d.fromMemberId,
                            fromDisplayName: `${d.fromCoupleName} (${d.fromDisplayName})`,
                            toMemberId: d.toMemberId,
                            toDisplayName: `${d.toCoupleName} (${d.toDisplayName})`,
                            amount: d.amount,
                          },
                          i
                        )
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {expenses.length > 0 && balances.length > 0 ? (
        <div className="mt-3">
          <SettlementAuditPanel
            expenses={expenses}
            members={balances.map((b) => ({
              id: b.memberId,
              displayName: b.displayName,
            }))}
            debts={simplifiedDebts}
            settlements={settlements.map((s) => ({
              id: s.id,
              fromMemberId: s.from_member_id,
              toMemberId: s.to_member_id,
              amountBase: s.amount_base,
              note: s.note,
            }))}
            baseCurrency={baseCurrency}
            balanceNetByMemberId={Object.fromEntries(
              balances.map((b) => [b.memberId, b.netBalance])
            )}
          />
        </div>
      ) : null}
    </>
  );
}

function ExpenseCard({
  exp,
  members,
  couples = [],
  baseCurrency,
  cashbookMode,
  onDelete,
  canDelete,
  canEdit,
  receiptUploadUrl,
  onReceiptChanged,
  onGenerateAiImage,
  onDeleteAiImage,
  onResendMail,
  onUpdate,
  onDuplicate,
  onCoupleSettle,
  onSetDocument,
  trips,
  lockedTripId,
  aiImageBusy,
  mailBusy,
  editBusy,
  coupleSettleBusy,
}: {
  exp: ExpenseListItem;
  members: Array<{
    id: number;
    display_name: string;
    avatar_url?: string | null;
  }>;
  couples?: Array<{ id: number; name: string; memberIds: number[] }>;
  baseCurrency: string;
  cashbookMode?: boolean;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  canEdit?: boolean;
  receiptUploadUrl?: string;
  onReceiptChanged?: () => void;
  onGenerateAiImage?: (expenseId: number) => void;
  onDeleteAiImage?: (expenseId: number) => void;
  onResendMail?: (expenseId: number) => void;
  onUpdate?: (expenseId: number, payload: ExpenseEditPayload) => Promise<void>;
  onDuplicate?: (exp: ExpenseListItem) => void;
  onCoupleSettle?: (expenseId: number) => void | Promise<void>;
  onSetDocument?: (
    expenseId: number,
    documentId: number | null
  ) => Promise<void>;
  trips?: TripPickerOption[];
  lockedTripId?: number | null;
  aiImageBusy?: boolean;
  mailBusy?: boolean;
  editBusy?: boolean;
  coupleSettleBusy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [linkDocOpen, setLinkDocOpen] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const receiptRef = useRef<ExpenseReceiptControlsHandle>(null);
  const [editDesc, setEditDesc] = useState(exp.description || "");
  const [editDate, setEditDate] = useState(exp.expense_date || "");
  const [editPayer, setEditPayer] = useState(String(exp.paid_by_member_id));
  const [editPlace, setEditPlace] = useState(exp.place_name || "");
  const [editNote, setEditNote] = useState(exp.note || "");
  const [editAmount, setEditAmount] = useState(String(exp.amount));
  const [editCurrency, setEditCurrency] = useState(exp.currency);
  const [editRate, setEditRate] = useState(String(exp.exchange_rate ?? 1));
  const [editTripEventId, setEditTripEventId] = useState<number | null>(
    exp.trip_event?.id ?? exp.trip_event_id ?? null
  );
  const [editSplit, setEditSplit] = useState<ExpenseSplitSelection>(() => ({
    mode: "equal",
    memberIds: exp.splits.map((s) => s.member_id),
  }));
  const [editRateLoading, setEditRateLoading] = useState(false);
  const [editDirection, setEditDirection] = useState<"expense" | "income">(
    exp.direction === "income" ? "income" : "expense"
  );
  const [editCategory, setEditCategory] = useState(
    () => expenseVisualForExpense(exp).label
  );

  const isIncome = (exp.direction || "expense") === "income";
  const memberName = (id: number) =>
    members.find((m) => m.id === id)?.display_name ?? `#${id}`;
  const memberAvatar = (id: number) =>
    members.find((m) => m.id === id)?.avatar_url ?? null;
  const coupleSettle = useMemo(
    () =>
      cashbookMode
        ? null
        : coupleSettlePreviewForExpense(exp, members, couples),
    [cashbookMode, exp, members, couples]
  );

  const visual = expenseVisualForExpense(exp);
  const isoDate = toIsoDateOnly(exp.expense_date);
  /** Avatars = Anteilnehmer only (not payer-only extras). */
  const participantIds = Array.from(
    new Set(
      exp.splits
        .filter((s) => Number(s.share_amount_base) > 0.004)
        .map((s) => s.member_id)
    )
  );
  const fx = formatMoneyFxSummary({
    amount: exp.amount,
    currency: exp.currency,
    amountBase: exp.amount_base,
    baseCurrency,
    exchangeRate: exp.exchange_rate,
  });

  const eligibleEditPayerIds = useMemo(
    () => eligiblePayerIdsFromSplit(editSplit, couples || [], members),
    [editSplit, couples, members]
  );
  const eligibleEditPayers = useMemo(
    () => members.filter((m) => eligibleEditPayerIds.includes(m.id)),
    [members, eligibleEditPayerIds]
  );

  useEffect(() => {
    if (cashbookMode || isIncome || !editing) return;
    const next = coercePayerId(Number(editPayer) || null, eligibleEditPayerIds);
    if (next != null && String(next) !== editPayer) {
      setEditPayer(String(next));
    }
  }, [
    cashbookMode,
    isIncome,
    editing,
    editSplit,
    editPayer,
    eligibleEditPayerIds,
  ]);

  function startEdit() {
    setEditDesc(exp.description || "");
    setEditDate(exp.expense_date || "");
    setEditPayer(String(exp.paid_by_member_id));
    setEditPlace(exp.place_name || "");
    setEditNote(exp.note || "");
    setEditAmount(String(exp.amount));
    setEditCurrency(exp.currency);
    setEditRate(String(exp.exchange_rate ?? 1));
    setEditTripEventId(exp.trip_event?.id ?? exp.trip_event_id ?? null);
    setEditSplit({
      mode: "equal",
      memberIds: exp.splits.map((s) => s.member_id),
    });
    setEditDirection(exp.direction === "income" ? "income" : "expense");
    setEditCategory(expenseVisualForExpense(exp).label);
    setDetailOpen(true);
    setEditing(true);
  }

  async function fetchEditRate(from: string) {
    if (from === baseCurrency) {
      setEditRate("1");
      return;
    }
    setEditRateLoading(true);
    try {
      const params = new URLSearchParams({ from, to: baseCurrency });
      if (editDate) params.set("date", editDate);
      const res = await fetch(`/api/finance-ledgers/exchange-rate?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kurs laden fehlgeschlagen");
      setEditRate(String(json.rate));
    } catch {
      /* keep previous rate */
    } finally {
      setEditRateLoading(false);
    }
  }

  function splitValid(sel: ExpenseSplitSelection) {
    if (sel.mode === "coupleEqual") return sel.coupleIds.length > 0;
    return sel.memberIds.length > 0;
  }

  async function saveEdit() {
    if (!onUpdate) return;
    const parsedAmount = Number(editAmount);
    const parsedRate = Number(editRate) || 1;
    if (!(parsedAmount > 0)) return;
    if (!cashbookMode && !isIncome && !splitValid(editSplit)) return;
    await onUpdate(exp.id, {
      description: editDesc.trim() || null,
      expenseDate: editDate || null,
      paidByMemberId: Number(editPayer) || exp.paid_by_member_id,
      place: editPlace.trim() || null,
      note: editNote.trim() || null,
      amount: parsedAmount,
      currency: editCurrency,
      exchangeRate: editCurrency === baseCurrency ? 1 : parsedRate,
      direction: cashbookMode ? editDirection : undefined,
      tripEventId: editTripEventId,
      categoryLabel: editCategory,
      ...(!cashbookMode && !isIncome ? { split: editSplit } : {}),
    });
    setEditing(false);
  }

  return (
    <div id={`expense-card-${exp.id}`} className="ml-3 pt-5">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border bg-card text-sm transition-shadow",
          detailOpen && "ring-2 ring-[var(--brand-finance)]/30",
          !editing && "cursor-pointer hover:bg-muted/20"
        )}
        onClick={() => {
          if (!editing) setDetailOpen(true);
        }}
        onKeyDown={(e) => {
          if (!editing && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-start gap-3 px-3 py-3 sm:gap-4">
          <IconCircle
            icon={visual.icon}
            tone="green"
            shape="circle"
            size="lg"
            className="mt-0.5 h-12 w-12 shrink-0 sm:h-14 sm:w-14 [&_svg]:h-6 [&_svg]:w-6 sm:[&_svg]:h-7 sm:[&_svg]:w-7"
          />

          <div className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden sm:gap-3">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="min-w-0 break-words text-base font-black leading-snug tracking-tight text-foreground line-clamp-2 sm:text-xl">
                {exp.description || (isIncome ? "Einnahme" : "Ausgabe")}
              </p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                <p className="truncate text-xs text-muted-foreground">
                  {isoDate ? formatDateDe(isoDate) : "Ohne Datum"}
                  {" · "}
                  {isIncome ? "Einnahme" : visual.label}
                </p>
                {!cashbookMode && participantIds.length > 0 ? (
                  <div className="flex -space-x-1.5">
                    {participantIds.slice(0, 4).map((id) => (
                      <span key={id} title={memberName(id)}>
                        <UserAvatar
                          name={memberName(id)}
                          src={memberAvatar(id)}
                          size="xs"
                          className={cn(
                            "ring-2 ring-card",
                            id === exp.paid_by_member_id &&
                              "ring-[var(--brand-finance)]"
                          )}
                        />
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {Boolean(exp.pre_settled) ? (
                (() => {
                  const badge = expenseSettledBadge(exp.pre_settled);
                  if (!badge) return null;
                  return (
                    <Badge
                      variant="secondary"
                      title={badge.title}
                      className="mt-1.5 h-5 w-fit gap-0.5 border border-[var(--brand-finance)]/25 bg-[var(--brand-finance-soft)] px-1.5 text-[0.625rem] font-semibold text-[var(--brand-finance)]"
                    >
                      <Check
                        className="size-3"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      {badge.label}
                    </Badge>
                  );
                })()
              ) : null}
              {exp.trip_event ? (
                <Link
                  href={`/trips/${exp.trip_event.trip_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1.5 inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-[var(--brand-docs-soft)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--brand-docs)] hover:opacity-90"
                  title={
                    [
                      formatDateDe(exp.trip_event.start_date) || null,
                      exp.trip_event.start_time || null,
                      exp.trip_event.title,
                      exp.trip_event.trip_title
                        ? `(${exp.trip_event.trip_title})`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                >
                  <Luggage className="size-3 shrink-0" />
                  <span>Travelbuddy: 1</span>
                </Link>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {exp.ai_image_url ? (
                <AiImagePreview
                  src={exp.ai_image_url}
                  brand="finance"
                  className="shrink-0"
                  imageClassName="h-[4.5rem] w-[4.5rem] rounded-lg object-cover"
                  onOpen={() => setZoomOpen(true)}
                />
              ) : aiImageBusy ? (
                <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--brand-finance)]/35 bg-[var(--brand-finance-soft)] text-[0.625rem] font-medium text-[var(--brand-finance)]">
                  KI…
                </div>
              ) : null}
              <p
                className={cn(
                  "text-right text-sm font-bold tabular-nums sm:text-base",
                  isIncome
                    ? "text-[var(--brand-finance)]"
                    : "text-foreground",
                  !exp.ai_image_url && !aiImageBusy && "text-base sm:text-lg"
                )}
              >
                {isIncome ? "+" : ""}
                {formatMoney(exp.amount_base, baseCurrency)}
              </p>
              {fx.hasFx ? (
                <div className="max-w-[9.5rem] text-right text-[0.625rem] leading-snug text-muted-foreground sm:max-w-[11rem] sm:text-xs">
                  <p className="tabular-nums">{fx.primary}</p>
                  <p className="tabular-nums">
                    {formatExchangeRateLine({
                      currency: exp.currency,
                      baseCurrency,
                      exchangeRate: exp.exchange_rate,
                      amount: exp.amount,
                      amountBase: exp.amount_base,
                    })}
                  </p>
                </div>
              ) : null}
              {exp.document || exp.document_id ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-finance-soft)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--brand-finance)]">
                  <FileText className="size-3" />
                  1 Beleg
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setEditing(false);
        }}
      >
        <DialogContent className="flex max-h-[92dvh] w-[min(96vw,26rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[min(96vw,48rem)] sm:max-w-3xl md:w-[min(96vw,56rem)] md:max-w-4xl lg:w-[min(96vw,72rem)] lg:max-w-5xl">
          <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3 pr-12 text-left">
            <DialogTitle className="truncate text-base">
              {editing
                ? "Bearbeiten"
                : exp.description || (isIncome ? "Einnahme" : "Ausgabe")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Details und Aktionen zur Ausgabe
            </DialogDescription>
          </DialogHeader>

          {editing && canEdit && onUpdate ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Beschreibung</Label>
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Kategorie</Label>
                  <Select
                    value={editCategory}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setEditCategory(v);
                    }}
                    items={Object.fromEntries(
                      EXPENSE_CATEGORY_LABELS.map((label) => [label, label])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORY_LABELS.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Betrag</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Währung</Label>
                  <Select
                    value={editCurrency}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setEditCurrency(v);
                      if (v === baseCurrency) {
                        setEditRate("1");
                      } else {
                        void fetchEditRate(v);
                      }
                    }}
                    items={Object.fromEntries(
                      COMMON_CURRENCIES.map((c) => [c, c])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kurs → {baseCurrency}</Label>
                  <div className="flex gap-1.5">
                    <Input
                      type="number"
                      step="0.0001"
                      value={editRate}
                      disabled={editCurrency === baseCurrency}
                      onChange={(e) => setEditRate(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="EZB-Kurs laden"
                      disabled={
                        editRateLoading || editCurrency === baseCurrency
                      }
                      onClick={() => void fetchEditRate(editCurrency)}
                    >
                      <Download
                        className={cn(
                          "size-4",
                          editRateLoading && "animate-pulse"
                        )}
                      />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Datum</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
                {cashbookMode ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Typ</Label>
                    <Select
                      value={editDirection}
                      onValueChange={(v) => {
                        if (v == null) return;
                        setEditDirection(v as "expense" | "income");
                      }}
                      items={{
                        expense: "Ausgabe",
                        income: "Einnahme",
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Ausgabe</SelectItem>
                        <SelectItem value="income">Einnahme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    {!isIncome ? (
                      <div className="sm:col-span-2">
                        <ExpenseSplitParticipants
                          compact
                          members={members}
                          couples={couples}
                          value={editSplit}
                          onChange={setEditSplit}
                        />
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <Label className="text-xs">Bezahlt von</Label>
                      <Select
                        value={editPayer}
                        onValueChange={(v) => {
                          if (v == null) return;
                          setEditPayer(v);
                        }}
                        items={Object.fromEntries(
                          eligibleEditPayers.map((m) => [
                            String(m.id),
                            m.display_name,
                          ])
                        )}
                        disabled={eligibleEditPayers.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Aus Beteiligung" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleEditPayers.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Ort</Label>
                  <Input
                    value={editPlace}
                    onChange={(e) => setEditPlace(e.target.value)}
                    placeholder="z. B. Denny’s, Las Vegas"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Notiz</Label>
                  <Textarea
                    rows={2}
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                {trips && trips.length > 0 ? (
                  <div className="sm:col-span-2">
                    <ExpenseTripEventPicker
                      compact
                      trips={trips}
                      lockedTripId={lockedTripId}
                      initialTripId={exp.trip_event?.trip_id ?? null}
                      value={editTripEventId}
                      onChange={setEditTripEventId}
                    />
                  </div>
                ) : null}
                {editCurrency !== baseCurrency && Number(editAmount) > 0 ? (
                  <p className="text-[0.6875rem] text-muted-foreground sm:col-span-2">
                    ≈{" "}
                    {formatMoney(
                      Number(editAmount) * (Number(editRate) || 1),
                      baseCurrency
                    )}{" "}
                    bei Kurs {editRate || "—"}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    disabled={
                      editBusy ||
                      !(Number(editAmount) > 0) ||
                      (!cashbookMode && !isIncome && !splitValid(editSplit))
                    }
                    onClick={() => void saveEdit()}
                  >
                    Speichern
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={editBusy}
                    onClick={() => setEditing(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
              <DetailCarousel
                resetKey={exp.id}
                className="h-full max-h-[min(84dvh,52rem)] sm:max-h-[min(86dvh,56rem)]"
              >
                <div className="flex flex-col items-center gap-3 px-2 pb-2 pt-1 text-center sm:gap-4 sm:px-4">
                  {exp.ai_image_url ? (
                    <AiImagePreview
                      src={exp.ai_image_url}
                      brand="finance"
                      imageClassName="h-56 w-56 rounded-2xl object-cover sm:h-72 sm:w-72 md:h-80 md:w-80 lg:h-96 lg:w-96"
                      onOpen={() => setZoomOpen(true)}
                    />
                  ) : (
                    <IconCircle
                      icon={visual.icon}
                      tone="green"
                      shape="circle"
                      size="lg"
                      className="h-20 w-20 sm:h-24 sm:w-24 [&_svg]:h-9 [&_svg]:w-9 sm:[&_svg]:h-11 sm:[&_svg]:w-11"
                    />
                  )}
                  <div className="min-w-0 space-y-1">
                    <p className="text-lg font-black leading-snug tracking-tight text-foreground sm:text-2xl">
                      {exp.description || (isIncome ? "Einnahme" : "Ausgabe")}
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-bold tabular-nums sm:text-3xl",
                        isIncome
                          ? "text-[var(--brand-finance)]"
                          : "text-foreground"
                      )}
                    >
                      {isIncome ? "+" : ""}
                      {formatMoney(exp.amount_base, baseCurrency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isIncome ? "Einnahme" : visual.label}
                    </p>
                    {isoDate ? (
                      <div className="mx-auto grid w-fit grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-left text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground/80">
                          Von
                        </span>
                        <span className="tabular-nums">
                          {formatDateDe(isoDate)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ohne Datum</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {Boolean(exp.pre_settled)
                      ? (() => {
                          const badge = expenseSettledBadge(exp.pre_settled);
                          if (!badge) return null;
                          return (
                            <Badge
                              variant="secondary"
                              title={badge.title}
                              className="h-6 gap-0.5 border border-[var(--brand-finance)]/25 bg-[var(--brand-finance-soft)] px-2 text-[0.6875rem] font-semibold text-[var(--brand-finance)]"
                            >
                              <Check
                                className="size-3"
                                strokeWidth={2.5}
                                aria-hidden
                              />
                              {badge.label}
                            </Badge>
                          );
                        })()
                      : null}
                    {exp.document || exp.document_id ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-finance-soft)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--brand-finance)]">
                        <FileText className="size-3.5" />
                        1 Beleg
                      </span>
                    ) : null}
                  </div>
                  {!cashbookMode && participantIds.length > 0 ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <p className="text-[0.6875rem] font-medium text-muted-foreground">
                        {memberName(exp.paid_by_member_id)} → Teilnehmer
                      </p>
                      <div className="flex -space-x-2">
                        {participantIds.slice(0, 6).map((id) => (
                          <span key={id} title={memberName(id)}>
                            <UserAvatar
                              name={memberName(id)}
                              src={memberAvatar(id)}
                              size="sm"
                              className={cn(
                                "ring-2 ring-popover",
                                id === exp.paid_by_member_id &&
                                  "ring-[var(--brand-finance)]"
                              )}
                            />
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Wischen für weitere Infos
                  </p>
                </div>

                {!cashbookMode && !isIncome && exp.splits.length > 0 ? (
                  <div className="space-y-3 px-2 py-1">
                    <p className="text-sm font-semibold text-foreground">
                      Anteil pro Person
                    </p>
                    <ul className="space-y-2">
                      {[...exp.splits]
                        .sort((a, b) =>
                          memberName(a.member_id).localeCompare(
                            memberName(b.member_id),
                            "de"
                          )
                        )
                        .map((sp) => {
                          const isPayer =
                            sp.member_id === exp.paid_by_member_id;
                          return (
                            <li
                              key={sp.member_id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <UserAvatar
                                  name={memberName(sp.member_id)}
                                  src={memberAvatar(sp.member_id)}
                                  size="sm"
                                />
                                <span
                                  className={cn(
                                    "min-w-0 truncate text-sm",
                                    isPayer
                                      ? "font-medium text-foreground"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {memberName(sp.member_id)}
                                  {isPayer ? (
                                    <span className="ml-1 font-normal text-muted-foreground">
                                      (gezahlt)
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                {formatMoney(
                                  sp.share_amount_base,
                                  baseCurrency
                                )}
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ) : null}

                {fx.detail ||
                exp.place_name ||
                exp.note?.trim() ||
                exp.document ||
                exp.trip_event ||
                exp.receipt_url ? (
                  <div className="space-y-3 px-2 py-1">
                    <p className="text-sm font-semibold text-foreground">
                      Weitere Infos
                    </p>
                    {fx.detail ? (
                      <div className="space-y-1 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-xs leading-snug text-muted-foreground">
                        <p>Währung: {exp.currency.toUpperCase()}</p>
                        <p>FW Betrag: {fx.primary}</p>
                        <p className="text-sm font-bold text-foreground">
                          Betrag {baseCurrency}:{" "}
                          {formatMoney(exp.amount_base, baseCurrency)}
                        </p>
                        <p>
                          Kurs:{" "}
                          {formatExchangeRateLine({
                            currency: exp.currency,
                            baseCurrency,
                            exchangeRate: exp.exchange_rate,
                            amount: exp.amount,
                            amountBase: exp.amount_base,
                          })}
                        </p>
                      </div>
                    ) : null}
                    {exp.place_name ? (
                      <p className="flex items-start gap-2 text-sm text-foreground">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--brand-finance)]" />
                        <span className="break-words">{exp.place_name}</span>
                      </p>
                    ) : null}
                    {exp.note?.trim() ? (
                      <p className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-foreground">
                        {exp.note.trim()}
                      </p>
                    ) : null}
                    {exp.document ? (
                      <a
                        href={`/documents/${exp.document.id}`}
                        className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link2 className="size-4 shrink-0 text-[var(--brand-finance)]" />
                        {exp.document.title?.trim() ||
                          exp.document.original_file_name?.trim() ||
                          `Dokument #${exp.document.id}`}
                      </a>
                    ) : null}
                    {exp.trip_event ? (
                      <Link
                        href={`/trips/${exp.trip_event.trip_id}`}
                        className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Luggage className="mt-0.5 size-4 shrink-0 text-[var(--brand-docs)]" />
                        <span>
                          {formatDateDe(exp.trip_event.start_date) ||
                            "Ohne Datum"}
                          {exp.trip_event.start_time
                            ? `, ${exp.trip_event.start_time}`
                            : ""}
                          {" · "}
                          <span className="font-medium text-foreground">
                            {exp.trip_event.title}
                          </span>
                          {exp.trip_event.trip_title
                            ? ` (${exp.trip_event.trip_title})`
                            : ""}
                        </span>
                      </Link>
                    ) : null}
                    {exp.receipt_url ? (
                      <a
                        href={exp.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={exp.receipt_url}
                          alt="Beleg"
                          className="h-28 w-28 rounded-xl border border-border object-cover"
                        />
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2 px-2 py-1">
                  <p className="text-sm font-semibold text-foreground">
                    Aktionen
                  </p>
                  <div className="grid gap-1.5">
                    {canEdit && onUpdate ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start"
                        onClick={() => startEdit()}
                      >
                        <Pencil className="mr-2 size-4" />
                        Ändern
                      </Button>
                    ) : null}
                    {onDuplicate ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start"
                        onClick={() => onDuplicate(exp)}
                      >
                        <Copy className="mr-2 size-4" />
                        Duplizieren
                      </Button>
                    ) : null}
                    {canEdit && onCoupleSettle && coupleSettle ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start text-[var(--brand-finance)]"
                        disabled={coupleSettleBusy}
                        onClick={() => {
                          const ok = window.confirm(
                            `${coupleSettle.fromName} → ${coupleSettle.toName}: ${formatMoney(coupleSettle.amountBase, baseCurrency)} als Paar-Ausgleich buchen?\n\nStatus danach: «Manuell ausgeglichen».`
                          );
                          if (ok) void onCoupleSettle(exp.id);
                        }}
                      >
                        <Users className="mr-2 size-4" />
                        Paar-Ausgleich
                      </Button>
                    ) : null}
                    {receiptUploadUrl ? (
                      <ExpenseReceiptControls
                        ref={receiptRef}
                        expenseId={exp.id}
                        receiptUrl={exp.receipt_url}
                        uploadUrl={receiptUploadUrl}
                        onChanged={onReceiptChanged}
                        compact
                      />
                    ) : null}
                    {canEdit && onSetDocument ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start"
                        disabled={docBusy || editBusy}
                        onClick={() => setLinkDocOpen(true)}
                      >
                        <Link2 className="mr-2 size-4" />
                        {exp.document ? "Beleg ändern" : "Beleg verknüpfen"}
                      </Button>
                    ) : null}
                    {exp.document && canEdit && onSetDocument ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start text-destructive"
                        disabled={docBusy || editBusy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Paperless-Verknüpfung wirklich entfernen?"
                            )
                          ) {
                            return;
                          }
                          setDocBusy(true);
                          void onSetDocument(exp.id, null).finally(() =>
                            setDocBusy(false)
                          );
                        }}
                      >
                        <Unlink className="mr-2 size-4" />
                        Beleg lösen
                      </Button>
                    ) : null}
                    {onGenerateAiImage ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start"
                        disabled={aiImageBusy}
                        onClick={() => onGenerateAiImage(exp.id)}
                      >
                        <RefreshCw
                          className={cn(
                            "mr-2 size-4",
                            aiImageBusy && "animate-spin"
                          )}
                        />
                        {exp.ai_image_url ? "KI-Bild neu" : "KI-Bild erzeugen"}
                      </Button>
                    ) : null}
                    {exp.ai_image_url && onDeleteAiImage ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start text-destructive"
                        disabled={aiImageBusy}
                        onClick={() => onDeleteAiImage(exp.id)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        KI-Bild löschen
                      </Button>
                    ) : null}
                    {onResendMail ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start"
                        disabled={mailBusy || aiImageBusy}
                        onClick={() => onResendMail(exp.id)}
                      >
                        <Mail
                          className={cn(
                            "mr-2 size-4",
                            mailBusy && "animate-pulse"
                          )}
                        />
                        {mailBusy ? "Sendet…" : "Mail erneut"}
                      </Button>
                    ) : null}
                    {canDelete && onDelete ? (
                      <Button
                        type="button"
                        variant="destructive"
                        className="justify-start"
                        onClick={() => {
                          onDelete(exp.id);
                          setDetailOpen(false);
                        }}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Löschen
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="px-2 py-1">
                  <ActivityLogPanel
                    entityType="finance_expense"
                    entityId={exp.id}
                    compact
                  />
                </div>
              </DetailCarousel>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-h-[95dvh] w-[min(98vw,72rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{exp.description || "KI-Bild"}</DialogTitle>
            <DialogDescription>Vergrösserte Ansicht</DialogDescription>
          </DialogHeader>
          {exp.ai_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exp.ai_image_url}
              alt={exp.description || "KI-Bild"}
              className="mx-auto max-h-[min(88dvh,52rem)] w-full rounded-md object-contain"
            />
          ) : null}
          {onDeleteAiImage || onGenerateAiImage ? (
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              {onGenerateAiImage ? (
                <Button
                  variant="secondary"
                  className="w-full gap-1.5 sm:w-auto"
                  disabled={aiImageBusy}
                  onClick={() => onGenerateAiImage(exp.id)}
                >
                  <RefreshCw
                    className={cn("size-3.5", aiImageBusy && "animate-spin")}
                  />
                  {aiImageBusy ? "Generiert…" : "Neu generieren"}
                </Button>
              ) : null}
              {onDeleteAiImage ? (
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  disabled={aiImageBusy}
                  onClick={() => {
                    onDeleteAiImage(exp.id);
                    setZoomOpen(false);
                  }}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  Bild löschen
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {onSetDocument ? (
        <LinkPaperlessDocumentDialog
          open={linkDocOpen}
          onOpenChange={setLinkDocOpen}
          currentDocumentId={exp.document?.id ?? exp.document_id ?? null}
          title={
            exp.document
              ? "Paperless-Beleg ändern"
              : "Paperless-Beleg verknüpfen"
          }
          onSelect={async (documentId) => {
            setDocBusy(true);
            try {
              await onSetDocument(exp.id, documentId);
            } finally {
              setDocBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

export function ExpenseList({
  expenses,
  members,
  couples = [],
  baseCurrency,
  cashbookMode,
  onDelete,
  canDelete,
  canEdit,
  receiptUploadUrl,
  onReceiptChanged,
  onGenerateAiImage,
  onDeleteAiImage,
  onResendMail,
  onUpdateExpense,
  onDuplicateExpense,
  onCoupleSettle,
  onSetDocument,
  trips,
  lockedTripId,
  aiImageBusyId,
  mailBusyId,
  editBusyId,
  coupleSettleBusyId,
  renderStickyChrome,
}: {
  expenses: ExpenseListItem[];
  members: Array<{
    id: number;
    display_name: string;
    avatar_url?: string | null;
  }>;
  couples?: Array<{ id: number; name: string; memberIds: number[] }>;
  baseCurrency: string;
  cashbookMode?: boolean;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  canEdit?: boolean;
  receiptUploadUrl?: (expenseId: number) => string;
  onReceiptChanged?: () => void;
  onGenerateAiImage?: (expenseId: number) => void;
  onDeleteAiImage?: (expenseId: number) => void;
  onResendMail?: (expenseId: number) => void;
  onUpdateExpense?: (
    expenseId: number,
    payload: ExpenseEditPayload
  ) => Promise<void>;
  onDuplicateExpense?: (exp: ExpenseListItem) => void;
  onCoupleSettle?: (expenseId: number) => void | Promise<void>;
  onSetDocument?: (
    expenseId: number,
    documentId: number | null
  ) => Promise<void>;
  trips?: TripPickerOption[];
  lockedTripId?: number | null;
  aiImageBusyId?: number | null;
  mailBusyId?: number | null;
  editBusyId?: number | null;
  coupleSettleBusyId?: number | null;
  /**
   * Wrap search/filter + tab nav in sticky chrome.
   * Second arg is the date-timeline strip which the caller may render separately
   * (e.g. in its own always-sticky container).
   */
  renderStickyChrome?: (chrome: ReactNode, strip: ReactNode) => ReactNode;
}) {
  const isPwa = useIsStandalonePwa();
  const [query, setQuery] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [payerFilter, setPayerFilter] = useState<string>("__all__");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");
  const [coupleFilter, setCoupleFilter] = useState<string>("__all__");
  /** Einblenden (default) vs. ausblenden von «bereits ausgeglichen»-Buchungen. */
  const [settledFilter, setSettledFilter] = useState<"__show__" | "__hide__">(
    "__show__"
  );
  const [sortDir, setSortDir] = useListSortDir("finance-expenses", "desc");

  const categoryOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const exp of expenses) {
      labels.add(expenseVisualForExpense(exp).label);
    }
    return [...labels].sort((a, b) => a.localeCompare(b, "de"));
  }, [expenses]);

  const payerOptions = useMemo(() => {
    const ids = new Set(expenses.map((e) => e.paid_by_member_id));
    return members
      .filter((m) => ids.has(m.id))
      .slice()
      .sort((a, b) =>
        a.display_name.localeCompare(b.display_name, "de", {
          sensitivity: "base",
        })
      );
  }, [expenses, members]);

  const coupleOptions = useMemo(
    () =>
      couples
        .slice()
        .sort((a, b) =>
          a.name.localeCompare(b.name, "de", { sensitivity: "base" })
        ),
    [couples]
  );

  const filteredExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const coupleMemberIds =
      coupleFilter !== "__all__"
        ? new Set(
            couples.find((c) => String(c.id) === coupleFilter)?.memberIds ?? []
          )
        : null;
    const filtered = expenses.filter((exp) => {
      if (settledFilter === "__hide__" && isExpenseSettled(exp.pre_settled)) {
        return false;
      }
      if (
        payerFilter !== "__all__" &&
        String(exp.paid_by_member_id) !== payerFilter
      ) {
        return false;
      }
      if (categoryFilter !== "__all__") {
        if (expenseVisualForExpense(exp).label !== categoryFilter) {
          return false;
        }
      }
      if (coupleMemberIds) {
        if (!coupleMemberIds.has(exp.paid_by_member_id)) return false;
        const involved =
          exp.splits.length > 0
            ? exp.splits.map((s) => s.member_id)
            : [exp.paid_by_member_id];
        if (!involved.every((id) => coupleMemberIds.has(id))) return false;
      }
      if (!q) return true;
      const payerName =
        members.find((m) => m.id === exp.paid_by_member_id)?.display_name || "";
      const hay = [
        exp.description,
        exp.place_name,
        exp.note,
        exp.category_label,
        expenseVisualForExpense(exp).label,
        payerName,
        exp.trip_event?.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return filtered.sort((a, b) =>
      compareNullableDate(a.expense_date, b.expense_date, sortDir)
    );
  }, [
    expenses,
    members,
    couples,
    query,
    payerFilter,
    categoryFilter,
    coupleFilter,
    settledFilter,
    sortDir,
  ]);

  const filtersActive =
    query.trim() !== "" ||
    payerFilter !== "__all__" ||
    categoryFilter !== "__all__" ||
    coupleFilter !== "__all__" ||
    settledFilter !== "__show__";

  const activeFilterCount =
    (payerFilter !== "__all__" ? 1 : 0) +
    (categoryFilter !== "__all__" ? 1 : 0) +
    (coupleFilter !== "__all__" ? 1 : 0) +
    (settledFilter !== "__show__" ? 1 : 0);

  // Sticky navigator: always oldest → newest (left → right), independent of list sort.
  const expenseDayDates = useMemo(
    () =>
      uniqueSortedIsoDates(
        filteredExpenses.map((e) => e.expense_date),
        "asc"
      ),
    [filteredExpenses]
  );

  /** Day anchors in DOM order (matches list sort) for scroll highlighting. */
  const expenseDayDatesDom = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const exp of filteredExpenses) {
      const iso = toIsoDateOnly(exp.expense_date);
      if (!iso || seen.has(iso)) continue;
      seen.add(iso);
      out.push(iso);
    }
    return out;
  }, [filteredExpenses]);

  const expenseDayAnchorId = useCallback(
    (iso: string) => `expense-day-${iso}`,
    []
  );
  const activeExpenseDay = useActiveDateFromScroll(
    expenseDayDatesDom,
    expenseDayAnchorId
  );

  const toolsPanel =
    expenses.length > 0 ? (
      <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-2.5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Text suchen…"
              className="h-8 bg-background pl-8 pr-8 text-sm"
              aria-label="Ausgaben durchsuchen"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                title="Suche leeren"
                onClick={() => setQuery("")}
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="relative h-8 shrink-0 gap-1.5 bg-background px-2.5"
            aria-expanded={filterOpen}
            aria-controls="expense-list-filters"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <Filter className="size-3.5" />
            Filter
            {activeFilterCount > 0 ? (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 justify-center px-1 text-[0.625rem] font-semibold"
              >
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
          <ListSortControl
            storageKey="finance-expenses"
            label="Datum"
            defaultDir="desc"
            dir={sortDir}
            onDirChange={setSortDir}
            className="h-8"
          />
        </div>
        {filterOpen ? (
          <div
            id="expense-list-filters"
            className="grid gap-2 rounded-lg border border-border bg-background p-2.5 sm:grid-cols-2"
          >
            {!cashbookMode ? (
              <Select
                value={payerFilter}
                onValueChange={(v) => {
                  if (v != null) setPayerFilter(v);
                }}
                items={{
                  __all__: "Alle Zahler",
                  ...Object.fromEntries(
                    payerOptions.map((m) => [String(m.id), m.display_name])
                  ),
                }}
              >
                <SelectTrigger className="h-8 w-full min-w-0 text-sm">
                  <SelectValue placeholder="Zahler" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle Zahler</SelectItem>
                  {payerOptions.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                if (v != null) setCategoryFilter(v);
              }}
              items={{
                __all__: "Alle Kategorien",
                ...Object.fromEntries(
                  categoryOptions.map((label) => [label, label])
                ),
              }}
            >
              <SelectTrigger className="h-8 w-full min-w-0 text-sm">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Kategorien</SelectItem>
                {categoryOptions.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!cashbookMode && coupleOptions.length > 0 ? (
              <Select
                value={coupleFilter}
                onValueChange={(v) => {
                  if (v != null) setCoupleFilter(v);
                }}
                items={{
                  __all__: "Alle Paare",
                  ...Object.fromEntries(
                    coupleOptions.map((c) => [String(c.id), c.name])
                  ),
                }}
              >
                <SelectTrigger className="h-8 w-full min-w-0 text-sm">
                  <SelectValue placeholder="Paar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle Paare</SelectItem>
                  {coupleOptions.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={settledFilter}
              onValueChange={(v) => {
                if (v === "__show__" || v === "__hide__") setSettledFilter(v);
              }}
              items={{
                __show__: "Ausgeglichene: Ja",
                __hide__: "Ausgeglichene: Nein",
              }}
            >
              <SelectTrigger className="h-8 w-full min-w-0 text-sm">
                <SelectValue placeholder="Ausgeglichene" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__show__">Ausgeglichene: Ja</SelectItem>
                <SelectItem value="__hide__">Ausgeglichene: Nein</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {filtersActive ? (
          <div className="flex items-center justify-between gap-2 text-[0.6875rem] text-muted-foreground">
            <span>
              {filteredExpenses.length} von {expenses.length} angezeigt
            </span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-[0.6875rem] font-medium text-[var(--brand-finance)]"
              onClick={() => {
                setQuery("");
                setPayerFilter("__all__");
                setCategoryFilter("__all__");
                setCoupleFilter("__all__");
                setSettledFilter("__show__");
              }}
            >
              Filter zurücksetzen
            </Button>
          </div>
        ) : null}
      </div>
    ) : null;

  const chromeInner = (
    <div className="space-y-2">
      {isPwa && expenses.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full justify-between gap-2 bg-background"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((o) => !o)}
        >
          <span className="inline-flex items-center gap-1.5">
            <Search className="size-3.5" />
            Suche & Filter
            {activeFilterCount > 0 || query.trim() ? (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 justify-center px-1 text-[0.625rem] font-semibold"
              >
                {activeFilterCount + (query.trim() ? 1 : 0)}
              </Badge>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              toolsOpen && "rotate-180"
            )}
          />
        </Button>
      ) : null}
      {!isPwa || toolsOpen ? toolsPanel : null}
      {isPwa && !toolsOpen && filtersActive ? (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-left text-[0.6875rem] font-medium text-[var(--brand-finance)]"
          onClick={() => setToolsOpen(true)}
        >
          {filteredExpenses.length} von {expenses.length} · Filter anpassen
        </Button>
      ) : null}
    </div>
  );

  const stripElement = (
    <DateTimelineStrip
      dates={expenseDayDates}
      anchorIdForDate={expenseDayAnchorId}
      activeDate={activeExpenseDay}
      accent="finance"
    />
  );

  // When no renderStickyChrome callback: render strip as its own sticky element.
  const stripNode =
    !renderStickyChrome && expenseDayDates.length > 0 ? (
      <div className={cn(stickyStripClass({ belowMobileHeader: true }), "-mx-1 px-1")}>
        {stripElement}
      </div>
    ) : null;

  const chromeNode = renderStickyChrome
    ? renderStickyChrome(chromeInner, expenseDayDates.length > 0 ? stripElement : null)
    : chromeInner;

  let prevExpenseDay: string | null = null;

  return (
    <div className="space-y-4">
      {chromeNode}
      {stripNode}

      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {cashbookMode ? "Noch keine Buchungen." : "Noch keine Ausgaben."}
        </p>
      ) : filteredExpenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Treffer für die aktuelle Suche/Filter.
        </p>
      ) : (
        filteredExpenses.map((exp) => {
          const iso = toIsoDateOnly(exp.expense_date);
          const firstOfDay = Boolean(iso && iso !== prevExpenseDay);
          if (iso) prevExpenseDay = iso;
          return (
            <div
              key={exp.id}
              id={firstOfDay && iso ? `expense-day-${iso}` : undefined}
              className={firstOfDay ? "scroll-mt-36 lg:scroll-mt-48" : undefined}
            >
              <ExpenseCard
                exp={exp}
                members={members}
                couples={couples}
                baseCurrency={baseCurrency}
                cashbookMode={cashbookMode}
                canDelete={canDelete}
                canEdit={canEdit}
                trips={trips}
                lockedTripId={lockedTripId}
                onDelete={onDelete}
                receiptUploadUrl={
                  receiptUploadUrl ? receiptUploadUrl(exp.id) : undefined
                }
                onReceiptChanged={onReceiptChanged}
                onGenerateAiImage={onGenerateAiImage}
                onDeleteAiImage={onDeleteAiImage}
                onResendMail={onResendMail}
                onUpdate={onUpdateExpense}
                onDuplicate={onDuplicateExpense}
                onCoupleSettle={onCoupleSettle}
                onSetDocument={onSetDocument}
                aiImageBusy={aiImageBusyId === exp.id}
                mailBusy={mailBusyId === exp.id}
                editBusy={editBusyId === exp.id}
                coupleSettleBusy={coupleSettleBusyId === exp.id}
              />
            </div>
          );
        })
      )}


    </div>
  );
}

export type SettlementEditPayload = {
  fromMemberId: number;
  toMemberId: number;
  amount: number;
  currency: string;
  exchangeRate: number;
  note: string | null;
  settledAt: string | null;
};

export function SettlementList({
  settlements,
  members,
  baseCurrency,
  canEdit,
  canDelete,
  onUpdate,
  onDelete,
  editBusyId,
}: {
  settlements: Array<{
    id: number;
    from_member_id: number;
    to_member_id: number;
    amount: number;
    currency: string;
    exchange_rate?: number;
    amount_base: number;
    note: string | null;
    settled_at: string;
  }>;
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onUpdate?: (
    settlementId: number,
    payload: SettlementEditPayload
  ) => Promise<void>;
  onDelete?: (settlementId: number) => void;
  editBusyId?: number | null;
}) {
  return (
    <div className="space-y-3">
      {settlements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rückzahlungen.</p>
      ) : (
        settlements.map((s) => (
          <SettlementCard
            key={s.id}
            settlement={s}
            members={members}
            baseCurrency={baseCurrency}
            canEdit={canEdit}
            canDelete={canDelete}
            onUpdate={onUpdate}
            onDelete={onDelete}
            editBusy={editBusyId === s.id}
          />
        ))
      )}
    </div>
  );
}

function SettlementCard({
  settlement: s,
  members,
  baseCurrency,
  canEdit,
  canDelete,
  onUpdate,
  onDelete,
  editBusy,
}: {
  settlement: {
    id: number;
    from_member_id: number;
    to_member_id: number;
    amount: number;
    currency: string;
    exchange_rate?: number;
    amount_base: number;
    note: string | null;
    settled_at: string;
  };
  members: Array<{ id: number; display_name: string }>;
  baseCurrency: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onUpdate?: (
    settlementId: number,
    payload: SettlementEditPayload
  ) => Promise<void>;
  onDelete?: (settlementId: number) => void;
  editBusy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [fromId, setFromId] = useState(String(s.from_member_id));
  const [toId, setToId] = useState(String(s.to_member_id));
  const [amount, setAmount] = useState(String(s.amount));
  const [currency, setCurrency] = useState(s.currency);
  const [rate, setRate] = useState(String(s.exchange_rate ?? 1));
  const [note, setNote] = useState(s.note || "");
  const [settledAt, setSettledAt] = useState(s.settled_at?.slice(0, 10) || "");

  const memberName = (id: number) =>
    members.find((m) => m.id === id)?.display_name ?? `#${id}`;
  const visual = settlementVisual();
  const fx = formatMoneyFxSummary({
    amount: s.amount,
    currency: s.currency,
    amountBase: s.amount_base,
    baseCurrency,
    exchangeRate: s.exchange_rate,
  });
  const settledLabel = formatDateDe(s.settled_at);

  function startEdit() {
    setFromId(String(s.from_member_id));
    setToId(String(s.to_member_id));
    setAmount(String(s.amount));
    setCurrency(s.currency);
    setRate(String(s.exchange_rate ?? 1));
    setNote(s.note || "");
    setSettledAt(s.settled_at?.slice(0, 10) || "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!onUpdate) return;
    const parsedAmount = Number(amount);
    const parsedRate = Number(rate) || 1;
    if (!(parsedAmount > 0) || fromId === toId) return;
    await onUpdate(s.id, {
      fromMemberId: Number(fromId),
      toMemberId: Number(toId),
      amount: parsedAmount,
      currency,
      exchangeRate: currency === baseCurrency ? 1 : parsedRate,
      note: note.trim() || null,
      settledAt: settledAt || null,
    });
    setEditing(false);
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "rounded-xl border border-border/60 bg-card py-2.5 pl-3 pr-3 text-sm shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
        )}
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0">
            <IconCircle icon={visual.icon} tone={visual.tone} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-snug">
              <span>{memberName(s.from_member_id)}</span>
              {" → "}
              <span>{memberName(s.to_member_id)}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fx.primary}
              {settledLabel ? ` · ${settledLabel}` : ""}
            </p>
            {fx.detail ? (
              <div className="mt-0.5 space-y-0.5 text-[0.6875rem] leading-snug text-muted-foreground">
                <p>Währung: {s.currency.toUpperCase()}</p>
                <p>FW Betrag: {fx.primary}</p>
                <p className="text-xs font-bold text-foreground">
                  Betrag {baseCurrency}:{" "}
                  {formatMoney(s.amount_base, baseCurrency)}
                </p>
                <p>
                  Kurs:{" "}
                  {formatExchangeRateLine({
                    currency: s.currency,
                    baseCurrency,
                    exchangeRate: s.exchange_rate,
                    amount: s.amount,
                    amountBase: s.amount_base,
                  })}
                </p>
              </div>
            ) : null}
            {s.note ? (
              <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
            ) : null}

            {editing && canEdit && onUpdate ? (
              <div className="mt-3 grid gap-2 rounded-xl border border-border/50 bg-background/60 p-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Von</Label>
                  <Select
                    value={fromId}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setFromId(v);
                    }}
                    items={Object.fromEntries(
                      members.map((m) => [String(m.id), m.display_name])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">An</Label>
                  <Select
                    value={toId}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setToId(v);
                    }}
                    items={Object.fromEntries(
                      members.map((m) => [String(m.id), m.display_name])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Betrag</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Währung</Label>
                  <Select
                    value={currency}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setCurrency(v);
                      if (v === baseCurrency) setRate("1");
                    }}
                    items={Object.fromEntries(
                      COMMON_CURRENCIES.map((c) => [c, c])
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kurs → {baseCurrency}</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={rate}
                    disabled={currency === baseCurrency}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Datum</Label>
                  <Input
                    type="date"
                    value={settledAt}
                    onChange={(e) => setSettledAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Notiz</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    disabled={
                      editBusy || !(Number(amount) > 0) || fromId === toId
                    }
                    onClick={() => void saveEdit()}
                  >
                    Speichern
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={editBusy}
                    onClick={() => setEditing(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {canEdit && onUpdate && !editing ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={startEdit}
              >
                <Pencil className="mr-1 size-3.5" />
                Ändern
              </Button>
            ) : null}
            {canDelete && onDelete ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                title="Rückzahlung löschen"
                onClick={() => onDelete(s.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  action,
  tone = "green",
  icon,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: IconTone;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? Users;
  return (
    <Card
      tone={tone}
      className="overflow-hidden border-border/60 shadow-[0_4px_16px_rgba(20,32,28,0.05)]"
    >
      <CardHeader
        tone={tone}
        className="flex flex-row items-center justify-between pb-2"
      >
        <CardTitle className="flex items-center gap-2 text-base">
          <IconCircle icon={Icon} tone={tone} size="sm" />
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
