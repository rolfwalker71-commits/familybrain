"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  LayoutDashboard,
  List,
  Plus,
  Receipt,
  RefreshCw,
  ArrowLeftRight,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BalanceView,
  ExpenseList,
  SectionCard,
  SettlementList,
  type BalanceDebt,
  type ExpenseListItem,
} from "@/components/finance-brain/balance-view";
import {
  LedgerOverviewDashboards,
  scrollToExpenseCard,
} from "@/components/finance-brain/ledger-overview-dashboards";
import { PendingReceiptPicker } from "@/components/finance-brain/expense-receipt-controls";
import {
  ExpenseSplitParticipants,
  type ExpenseSplitSelection,
} from "@/components/finance-brain/expense-split-participants";
import {
  FinanceTabNav,
  parseFinanceLedgerTab,
  type FinanceLedgerTab,
  type FinanceTabItem,
} from "@/components/finance-brain/finance-tab-nav";
import { COMMON_CURRENCIES } from "@/lib/finance-brain/constants";
import { formatMoney } from "@/lib/finance-brain/format";
import { confirmSettlementAmount } from "@/lib/finance-brain/settlement-confirm";
import { capSettlementToCreditorNet } from "@/lib/finance-brain/settlement";
import { todayDateInputValue } from "@/lib/utils/dates";

type ShareData = {
  member: { id: number; display_name: string };
  ledger: {
    id: number;
    title: string;
    base_currency: string;
    trip_title: string | null;
  };
  members: Array<{ id: number; display_name: string }>;
  expenses: Array<{
    id: number;
    description: string | null;
    amount: number;
    currency: string;
    exchange_rate?: number;
    amount_base: number;
    expense_date: string | null;
    paid_by_member_id: number;
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
    pre_settled?: number | boolean;
    created_at?: string;
    splits: Array<{ member_id: number; share_amount_base: number }>;
  }>;
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
  balances: Array<{
    memberId: number;
    displayName: string;
    paidBase: number;
    owedBase: number;
    settlementsReceivedBase: number;
    settlementsPaidBase: number;
    netBalance: number;
  }>;
  simplifiedDebts: Array<{
    fromMemberId: number;
    fromDisplayName: string;
    toMemberId: number;
    toDisplayName: string;
    amount: number;
  }>;
  minimalDebts?: Array<{
    fromMemberId: number;
    fromDisplayName: string;
    toMemberId: number;
    toDisplayName: string;
    amount: number;
  }>;
  couples?: Array<{ id: number; name: string; memberIds: number[] }>;
  coupleBalances?: Array<{
    coupleId: number;
    name: string;
    memberIds: number[];
    paidBase: number;
    owedBase: number;
    settlementsPaidBase: number;
    settlementsReceivedBase: number;
    netBalance: number;
  }>;
  coupleDebts?: Array<{
    fromCoupleId: number;
    fromCoupleName: string;
    toCoupleId: number;
    toCoupleName: string;
    amount: number;
    fromMemberId: number;
    fromDisplayName: string;
    toMemberId: number;
    toDisplayName: string;
  }>;
};

export function FinanceShareClient({ token }: { token: string }) {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-center text-sm text-muted-foreground">
          Lade Abrechnung…
        </p>
      }
    >
      <FinanceShareInner token={token} />
    </Suspense>
  );
}

function FinanceShareInner({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState("CHF");
  const [expRate, setExpRate] = useState("1");
  const [expDesc, setExpDesc] = useState("");
  const [expDate, setExpDate] = useState(todayDateInputValue);
  const [expPlace, setExpPlace] = useState("");
  const [expNote, setExpNote] = useState("");
  const [expPayer, setExpPayer] = useState<string>("");
  const [expSplit, setExpSplit] = useState<ExpenseSplitSelection>({
    mode: "equal",
    memberIds: [],
  });
  const [expPreSettled, setExpPreSettled] = useState(false);

  const [setAmount, setSetAmount] = useState("");
  const [setCurrency, setSetCurrency] = useState("CHF");
  const [setRate, setSetRate] = useState("1");
  const [setTo, setSetTo] = useState<string>("");
  const [setNote, setSetNote] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [settlementRateLoading, setSettlementRateLoading] = useState(false);
  const [recordBusyKey, setRecordBusyKey] = useState<string | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [aiImageBusyId, setAiImageBusyId] = useState<number | null>(null);
  const [mailBusyId, setMailBusyId] = useState<number | null>(null);
  const [editBusyId, setEditBusyId] = useState<number | null>(null);
  const aiAttemptedRef = useRef<Set<number>>(new Set());
  const formDefaultsSeededRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/share/f/${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json);
      if (!formDefaultsSeededRef.current) {
        setExpCurrency(json.ledger.base_currency);
        setSetCurrency(json.ledger.base_currency);
        setSetRate("1");
        formDefaultsSeededRef.current = true;
      }
      setExpPayer(String(json.member.id));
      if (json.members?.length) {
        setExpSplit((prev) => {
          if (prev.mode === "equal" && prev.memberIds.length > 0) return prev;
          if (prev.mode === "coupleEqual" && prev.coupleIds.length > 0) return prev;
          return { mode: "equal", memberIds: json.members.map((m: { id: number }) => m.id) };
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data || aiImageBusyId != null) return;
    const missing = data.expenses.find(
      (e) => !e.ai_image_url && !aiAttemptedRef.current.has(e.id)
    );
    if (!missing) return;
    aiAttemptedRef.current.add(missing.id);
    void generateAiImage(missing.id, missing.place_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, aiImageBusyId]);

  async function fetchEcbRate(opts?: {
    from?: string;
    date?: string;
    target?: "expense" | "settlement";
  }) {
    if (!data) return;
    const target = opts?.target ?? "expense";
    const from =
      opts?.from ??
      (target === "settlement" ? setCurrency : expCurrency);
    const date = opts?.date ?? (target === "settlement" ? undefined : expDate);
    const setRateFn = target === "settlement" ? setSetRate : setExpRate;
    const setLoading =
      target === "settlement" ? setSettlementRateLoading : setRateLoading;

    if (from === data.ledger.base_currency) {
      setRateFn("1");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from,
        to: data.ledger.base_currency,
      });
      if (date) params.set("date", date);
      const res = await fetch(`/api/finance-ledgers/exchange-rate?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kurs laden fehlgeschlagen");
      setRateFn(String(json.rate));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function addExpense() {
    const amount = Number(expAmount);
    if (!amount) return;
    const splitOk =
      expSplit.mode === "coupleEqual"
        ? expSplit.coupleIds.length > 0
        : expSplit.memberIds.length > 0;
    if (!splitOk) {
      setError(
        expSplit.mode === "coupleEqual"
          ? "Mindestens ein Paar wählen"
          : "Mindestens eine beteiligte Person wählen"
      );
      return;
    }
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/expenses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            currency: expCurrency,
            exchangeRate: Number(expRate) || 1,
            description: expDesc.trim() || null,
            expenseDate: expDate || null,
            place: expPlace.trim() || null,
            note: expNote.trim() || null,
            paidByMemberId: expPayer ? Number(expPayer) : undefined,
            ...(expSplit.mode === "coupleEqual"
              ? {
                  splitMode: "coupleEqual" as const,
                  coupleIds: expSplit.coupleIds,
                }
              : { memberIds: expSplit.memberIds }),
            preSettled: expPreSettled,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      if (pendingReceipt && json.expense?.id) {
        const form = new FormData();
        form.set("file", pendingReceipt);
        const up = await fetch(
          `/api/share/f/${encodeURIComponent(token)}/expenses/${json.expense.id}/receipt`,
          { method: "POST", body: form }
        );
        const upJson = await up.json();
        if (!up.ok) {
          throw new Error(upJson.error || "Foto-Upload fehlgeschlagen");
        }
      }
      if (json.expense?.id) {
        aiAttemptedRef.current.add(json.expense.id);
        void generateAiImage(json.expense.id, expPlace.trim() || null);
      }
      setExpAmount("");
      setExpDesc("");
      setExpDate(todayDateInputValue());
      setExpPlace("");
      setExpNote("");
      setExpCurrency(data?.ledger.base_currency ?? "CHF");
      setExpRate("1");
      setPendingReceipt(null);
      setExpPreSettled(false);
      if (data?.members?.length) {
        setExpSplit({
          mode: "equal",
          memberIds: data.members.map((m) => m.id),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function generateAiImage(expenseId: number, place?: string | null) {
    setAiImageBusyId(expenseId);
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}/ai-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place: place ?? undefined }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "KI-Bild fehlgeschlagen");
      if (typeof json.warning === "string" && json.warning) {
        setError(json.warning);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiImageBusyId(null);
    }
  }

  async function deleteAiImage(expenseId: number) {
    setAiImageBusyId(expenseId);
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}/ai-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete: true }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Löschen fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiImageBusyId(null);
    }
  }

  async function resendExpenseMail(expenseId: number) {
    setMailBusyId(expenseId);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}/notify`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mailversand fehlgeschlagen");
      const sent = typeof json.sent === "number" ? json.sent : 0;
      setStatus(
        sent > 0
          ? `Belegmail erneut gesendet (${sent} Empfänger).`
          : "Belegmail erneut gesendet."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMailBusyId(null);
    }
  }

  async function updateExpense(
    expenseId: number,
    payload: {
      description: string | null;
      expenseDate: string | null;
      paidByMemberId: number;
      place: string | null;
      note: string | null;
      amount: number;
      currency: string;
      exchangeRate: number;
      split?: ExpenseSplitSelection;
    }
  ) {
    setEditBusyId(expenseId);
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: payload.description,
            expenseDate: payload.expenseDate,
            paidByMemberId: payload.paidByMemberId,
            place: payload.place,
            note: payload.note,
            amount: payload.amount,
            currency: payload.currency,
            exchangeRate: payload.exchangeRate,
            ...(payload.split ? { split: payload.split } : {}),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setEditBusyId(null);
    }
  }

  async function setExpenseDocument(
    expenseId: number,
    documentId: number | null
  ) {
    setEditBusyId(expenseId);
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Verknüpfung fehlgeschlagen");
      setStatus(
        documentId == null
          ? "Paperless-Verknüpfung entfernt."
          : "Paperless-Beleg verknüpft."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setEditBusyId(null);
    }
  }

  async function addSettlement() {
    const amount = Number(setAmount);
    if (!amount || !setTo || !data) return;
    const creditorNet =
      data.balances.find((b) => b.memberId === Number(setTo))?.netBalance ?? 0;
    const toName =
      data.members.find((m) => m.id === Number(setTo))?.display_name ??
      "Empfänger";
    const amountBase =
      setCurrency === data.ledger.base_currency
        ? amount
        : amount * (Number(setRate) || 1);
    const confirmed = confirmSettlementAmount({
      fromName: data.member.display_name,
      toName,
      suggested: amountBase,
      creditorNet,
      currency: data.ledger.base_currency,
    });
    if (confirmed == null) return;
    const postAmount =
      setCurrency === data.ledger.base_currency ? confirmed : amount;
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/settlements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toMemberId: Number(setTo),
            amount: postAmount,
            currency: setCurrency,
            exchangeRate: Number(setRate) || 1,
            note: setNote.trim() || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setSetAmount("");
      setSetNote("");
      setSetCurrency(data.ledger.base_currency);
      setSetRate("1");
      if (typeof json.warning === "string" && json.warning) {
        setError(json.warning);
      }
      setStatus("Rückzahlung erfasst.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function recordSuggestedDebt(debt: BalanceDebt) {
    if (!data) return;
    if (debt.fromMemberId !== data.member.id) return;
    const currency = data.ledger.base_currency;
    const creditorNet =
      data.balances.find((b) => b.memberId === debt.toMemberId)?.netBalance ??
      0;
    const amount = confirmSettlementAmount({
      fromName: debt.fromDisplayName,
      toName: debt.toDisplayName,
      suggested: debt.amount,
      creditorNet,
      currency,
    });
    if (amount == null) return;
    setRecordBusyKey(`debt-${debt.fromMemberId}-${debt.toMemberId}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/settlements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toMemberId: debt.toMemberId,
            amount,
            currency,
            exchangeRate: 1,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      if (typeof json.warning === "string" && json.warning) {
        setError(json.warning);
      }
      setStatus(
        `Rückzahlung → ${debt.toDisplayName} (${formatMoney(amount, currency)}) erfasst.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecordBusyKey(null);
    }
  }

  async function updateSettlement(
    settlementId: number,
    payload: {
      fromMemberId: number;
      toMemberId: number;
      amount: number;
      currency: string;
      exchangeRate: number;
      note: string | null;
      settledAt: string | null;
    }
  ) {
    setEditBusyId(settlementId);
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/settlements/${settlementId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setEditBusyId(null);
    }
  }

  async function deleteSettlement(settlementId: number) {
    if (!window.confirm("Rückzahlung löschen?")) return;
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/settlements/${settlementId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function setTab(tab: FinanceLedgerTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "expenses") params.delete("tab");
    else params.set("tab", tab);
    const q = params.toString();
    router.replace(q ? `?${q}` : "?", { scroll: false });
  }

  function duplicateExpense(exp: ExpenseListItem) {
    setExpDesc(exp.description || "");
    setExpAmount(String(exp.amount));
    setExpCurrency(exp.currency || data?.ledger.base_currency || "CHF");
    setExpRate(String(exp.exchange_rate ?? 1));
    setExpDate(exp.expense_date || todayDateInputValue());
    setExpPlace(exp.place_name || "");
    setExpNote(exp.note || "");
    setExpPayer(String(exp.paid_by_member_id));
    setExpSplit({
      mode: "equal",
      memberIds: exp.splits.map((s) => s.member_id),
    });
    setExpPreSettled(false);
    setPendingReceipt(null);
    setError(null);
    setStatus(
      "Vorlage geladen — anpassen und als neue Ausgabe speichern."
    );
    setTab("new");
  }

  if (loading && !data) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Lade Abrechnung…
      </p>
    );
  }
  if (!data) {
    return (
      <p className="p-6 text-center text-sm text-destructive">
        {error || "Link ungültig."}
      </p>
    );
  }

  const {
    member,
    ledger,
    members,
    expenses,
    settlements,
    balances,
    simplifiedDebts,
    minimalDebts = [],
    couples = [],
    coupleBalances = [],
    coupleDebts = [],
  } = data;
  const others = members.filter((m) => m.id !== member.id);
  const memberSelectItems = Object.fromEntries(
    members.map((m) => [
      String(m.id),
      m.id === member.id ? `${m.display_name} (ich)` : m.display_name,
    ])
  );
  const otherSelectItems = Object.fromEntries(
    others.map((m) => [String(m.id), m.display_name])
  );
  const currencySelectItems = Object.fromEntries(
    COMMON_CURRENCIES.map((c) => [c, c])
  );
  const activeTab = parseFinanceLedgerTab(searchParams.get("tab"), {
    isSplit: true,
  });
  const tabItems: FinanceTabItem[] = [
    { id: "overview", label: "Übersicht", icon: LayoutDashboard },
    { id: "payments", label: "Zahlungsinfos", icon: Scale },
    { id: "new", label: "Neu", icon: Plus, emphasize: true },
    { id: "expenses", label: "Ausgaben", icon: List },
    { id: "settle", label: "Ausgleich", icon: ArrowLeftRight },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-28">
      <div className="space-y-3 text-center">
        <div className="flex justify-center">
          <span className="inline-flex rounded-full bg-[var(--brand-finance-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-finance)]">
            FinanzBuddy
          </span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{ledger.title}</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als{" "}
          <span className="font-medium text-foreground">{member.display_name}</span>
        </p>
      </div>

      <FinanceTabNav
        items={tabItems}
        active={activeTab}
        onChange={setTab}
        alwaysBottom
      />

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => void load()}
      >
        <RefreshCw className="mr-2 size-4" />
        Aktualisieren
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      {activeTab === "overview" ? (
        <div className="space-y-4">
          <LedgerOverviewDashboards
            expenses={expenses}
            settlements={settlements}
            members={members.map((m) => ({
              id: m.id,
              display_name: m.display_name,
            }))}
            openDebts={simplifiedDebts}
            baseCurrency={ledger.base_currency}
            onOpenExpense={(expenseId) => {
              setTab("expenses");
              window.setTimeout(() => scrollToExpenseCard(expenseId), 120);
            }}
          />
        </div>
      ) : null}

      {activeTab === "payments" ? (
        <BalanceView
          balances={balances}
          simplifiedDebts={simplifiedDebts}
          minimalDebts={minimalDebts}
          coupleBalances={coupleBalances}
          coupleDebts={coupleDebts}
          baseCurrency={ledger.base_currency}
          highlightMemberId={member.id}
          onRecordDebt={recordSuggestedDebt}
          canRecordDebt={(d) => d.fromMemberId === member.id}
          recordBusyKey={recordBusyKey}
        />
      ) : null}

      {activeTab === "new" ? (
        <SectionCard title="Ausgabe erfassen" tone="green" icon={Receipt}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Betrag</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Währung</Label>
                <Select
                  value={expCurrency}
                  onValueChange={(v) => {
                    if (v == null) return;
                    setExpCurrency(v);
                    if (v === ledger.base_currency) {
                      setExpRate("1");
                    } else {
                      void fetchEcbRate({ from: v, target: "expense" });
                    }
                  }}
                  items={currencySelectItems}
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
                <Label>Kurs → {ledger.base_currency}</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    step="0.0001"
                    value={expRate}
                    onChange={(e) => setExpRate(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="EZB-Kurs laden"
                    disabled={
                      rateLoading || expCurrency === ledger.base_currency
                    }
                    onClick={() => void fetchEcbRate()}
                  >
                    <Download
                      className={cn("size-4", rateLoading && "animate-pulse")}
                    />
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Bezahlt von</Label>
              <Select
                value={expPayer}
                onValueChange={(v) => {
                  if (v == null) return;
                  setExpPayer(v);
                }}
                items={memberSelectItems}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.display_name}
                      {m.id === member.id ? " (ich)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <ExpenseSplitParticipants
                members={members}
                couples={couples}
                value={expSplit}
                onChange={setExpSplit}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--brand-finance)]"
                checked={expPreSettled}
                onChange={(e) => setExpPreSettled(e.target.checked)}
              />
              <span>
                <span className="font-medium">
                  Bereits ausgeglichen (nacherfasst)
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Zählt zu den Reise-Gesamtkosten. Anteile der anderen werden
                  automatisch als Rückzahlung an den Zahler gebucht — Saldo
                  bleibt neutral.
                </span>
              </span>
            </label>
            <div className="space-y-1">
              <Label>Beschreibung</Label>
              <Input
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Restaurant, Taxi…"
              />
            </div>
            <div className="space-y-1">
              <Label>Ort (optional)</Label>
              <Input
                value={expPlace}
                onChange={(e) => setExpPlace(e.target.value)}
                placeholder="Stadt, Lokal…"
              />
            </div>
            <div className="space-y-1">
              <Label>Notiz (optional)</Label>
              <Textarea
                rows={2}
                value={expNote}
                onChange={(e) => setExpNote(e.target.value)}
                placeholder="Zusätzliche Infos"
              />
            </div>
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Belegfoto (optional)</Label>
              <PendingReceiptPicker
                file={pendingReceipt}
                onChange={setPendingReceipt}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => void addExpense()}
              disabled={
                !expAmount ||
                !(expSplit.mode === "coupleEqual"
                  ? expSplit.coupleIds.length > 0
                  : expSplit.memberIds.length > 0)
              }
            >
              <Plus className="mr-2 size-4" />
              Ausgabe speichern
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "expenses" ? (
        <SectionCard title="Ausgaben" tone="green" icon={Receipt}>
          <ExpenseList
            expenses={expenses}
            members={members}
            couples={couples}
            baseCurrency={ledger.base_currency}
            canEdit
            receiptUploadUrl={(expenseId) =>
              `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}/receipt`
            }
            onReceiptChanged={() => void load()}
            onGenerateAiImage={(id) => void generateAiImage(id)}
            onDeleteAiImage={(id) => void deleteAiImage(id)}
            onResendMail={(id) => void resendExpenseMail(id)}
            onUpdateExpense={(id, payload) => updateExpense(id, payload)}
            onDuplicateExpense={duplicateExpense}
            onSetDocument={(id, documentId) =>
              setExpenseDocument(id, documentId)
            }
            aiImageBusyId={aiImageBusyId}
            mailBusyId={mailBusyId}
            editBusyId={editBusyId}
          />
        </SectionCard>
      ) : null}

      {activeTab === "settle" ? (
        <div className="space-y-4">
          {others.length > 0 ? (
            <SectionCard title="Rückzahlung" tone="green" icon={ArrowLeftRight}>
              <p className="mb-2 text-sm text-muted-foreground">
                Du zahlst jemandem Geld zurück (reduziert deine Schuld).
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>An</Label>
                  <Select
                    value={setTo}
                    onValueChange={(v) => {
                      if (v == null) return;
                      setSetTo(v);
                    }}
                    items={otherSelectItems}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Empfänger" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Betrag</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={setAmount}
                    onChange={(e) => setSetAmount(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Währung</Label>
                    <Select
                      value={setCurrency}
                      onValueChange={(v) => {
                        if (v == null) return;
                        setSetCurrency(v);
                        if (v === ledger.base_currency) {
                          setSetRate("1");
                        } else {
                          void fetchEcbRate({ from: v, target: "settlement" });
                        }
                      }}
                      items={currencySelectItems}
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
                    <Label>Kurs → {ledger.base_currency}</Label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        step="0.0001"
                        value={setRate}
                        disabled={setCurrency === ledger.base_currency}
                        onChange={(e) => setSetRate(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="EZB-Kurs laden"
                        disabled={
                          settlementRateLoading ||
                          setCurrency === ledger.base_currency
                        }
                        onClick={() =>
                          void fetchEcbRate({ target: "settlement" })
                        }
                      >
                        <Download
                          className={cn(
                            "size-4",
                            settlementRateLoading && "animate-pulse"
                          )}
                        />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notiz</Label>
                  <Textarea
                    rows={2}
                    value={setNote}
                    onChange={(e) => setSetNote(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => void addSettlement()}
                  disabled={!setAmount || !setTo}
                >
                  Rückzahlung erfassen
                </Button>
                {setAmount && setTo
                  ? (() => {
                      const suggested =
                        setCurrency === ledger.base_currency
                          ? Number(setAmount)
                          : Number(setAmount) * (Number(setRate) || 1);
                      const creditorNet =
                        balances.find((b) => b.memberId === Number(setTo))
                          ?.netBalance ?? 0;
                      const cap = capSettlementToCreditorNet(
                        suggested,
                        creditorNet
                      );
                      if (!cap.capped || !(suggested > 0)) return null;
                      const toName =
                        members.find((m) => m.id === Number(setTo))
                          ?.display_name ?? "Empfänger";
                      return (
                        <p className="text-xs text-amber-800">
                          Betrag übersteigt das offene Netto von {toName} (
                          {formatMoney(cap.creditorNet, ledger.base_currency)}
                          ). Beim Erfassen wird auf{" "}
                          {formatMoney(cap.amount, ledger.base_currency)}{" "}
                          begrenzt (Bestätigung).
                        </p>
                      );
                    })()
                  : null}
              </div>
            </SectionCard>
          ) : (
            <p className="text-sm text-muted-foreground">
              Keine weiteren Teilnehmer für Rückzahlungen.
            </p>
          )}

          <SectionCard title="Rückzahlungen" tone="green" icon={ArrowLeftRight}>
            <SettlementList
              settlements={settlements}
              members={members}
              baseCurrency={ledger.base_currency}
              canEdit
              canDelete
              onUpdate={(id, payload) => updateSettlement(id, payload)}
              onDelete={(id) => void deleteSettlement(id)}
              editBusyId={editBusyId}
            />
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
