"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Copy,
  Download,
  FileDown,
  ImagePlus,
  LayoutDashboard,
  Link2,
  List,
  Luggage,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  RotateCw,
  ArrowLeftRight,
  Sparkles,
  Unlink,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import {
  BalanceView,
  ExpenseList,
  SectionCard,
  SettlementList,
  type BalanceDebt,
  type ExpenseListItem,
} from "@/components/finance-brain/balance-view";
import { TripCostDashboard } from "@/components/finance-brain/trip-cost-dashboard";
import {
  LedgerOverviewDashboards,
  scrollToExpenseCard,
} from "@/components/finance-brain/ledger-overview-dashboards";
import { PendingReceiptPicker } from "@/components/finance-brain/expense-receipt-controls";
import { ExpenseTripEventPicker } from "@/components/finance-brain/expense-trip-event-picker";
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
import { COMMON_CURRENCIES, LEDGER_KIND_LABELS } from "@/lib/finance-brain/constants";
import { formatMoney, formatSignedMoney } from "@/lib/finance-brain/format";
import { confirmSettlementAmount } from "@/lib/finance-brain/settlement-confirm";
import { capSettlementToCreditorNet } from "@/lib/finance-brain/settlement";
import { cn } from "@/lib/utils";
import { todayDateInputValue } from "@/lib/utils/dates";

type Member = {
  id: number;
  display_name: string;
  email: string | null;
  share_url: string;
  invite_token?: string;
  invite_revoked_at: string | null;
  couple_id?: number | null;
  couple_name?: string | null;
};

type Couple = {
  id: number;
  name: string;
  memberIds: number[];
};

type LedgerDetail = {
  ledger: {
    id: number;
    title: string;
    base_currency: string;
    ledger_kind?: "split" | "normal";
    trip_id: number | null;
    trip_title: string | null;
    cover_url?: string | null;
    cover_prompt?: string | null;
  };
  members: Member[];
  expenses: Array<{
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
    pre_settled?: number | boolean;
    splits: Array<{ member_id: number; share_amount_base: number }>;
    created_at?: string;
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
  couples?: Couple[];
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
  cashbook?: {
    expenseTotalBase: number;
    incomeTotalBase: number;
    netBase: number;
  };
  costDashboard?: {
    baseCurrency: string;
    totalSpentBase: number;
    expenseCount: number;
    unlinkedCount: number;
    byPerson: Array<{
      memberId: number;
      displayName: string;
      paidBase: number;
      fairShareBase: number;
      deltaBase: number;
      netBalance: number;
    }>;
    byCouple?: Array<{
      coupleId: number;
      name: string;
      paidBase: number;
      fairShareBase: number;
      netBalance: number;
    }>;
    byCategory: Array<{
      label: string;
      totalBase: number;
      count: number;
      sharePct: number;
    }>;
    byEventType: Array<{
      label: string;
      totalBase: number;
      count: number;
      sharePct: number;
    }>;
  } | null;
};

type ImportDoc = {
  document_id: number;
  title: string | null;
  amount: number | null;
  currency: string | null;
  vendor: string | null;
  invoice_date: string | null;
  trip_event_title?: string | null;
};

type TripOption = {
  id: number;
  title: string;
};

export function FinanceLedgerDetailClient({ ledgerId }: { ledgerId: number }) {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lade Abrechnung…</p>
      }
    >
      <FinanceLedgerDetailInner ledgerId={ledgerId} />
    </Suspense>
  );
}

function FinanceLedgerDetailInner({ ledgerId }: { ledgerId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<LedgerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");

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
  const [couplePick, setCouplePick] = useState<number[]>([]);
  const [coupleName, setCoupleName] = useState("");
  const [expTripEventId, setExpTripEventId] = useState<number | null>(null);
  const [expDirection, setExpDirection] = useState<"expense" | "income">(
    "expense"
  );
  const [expPreSettled, setExpPreSettled] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [aiImageBusyId, setAiImageBusyId] = useState<number | null>(null);
  const [mailBusyId, setMailBusyId] = useState<number | null>(null);
  const [summaryMailBusy, setSummaryMailBusy] = useState(false);
  const [tripSummaryOpen, setTripSummaryOpen] = useState(false);
  const [tripSummaryBusy, setTripSummaryBusy] = useState(false);
  const [tripSummaryRecipients, setTripSummaryRecipients] = useState<
    Array<{ memberId: number; displayName: string; email: string }>
  >([]);
  const [tripSummarySelected, setTripSummarySelected] = useState<number[]>([]);
  const [editBusyId, setEditBusyId] = useState<number | null>(null);
  const aiAttemptedRef = useRef<Set<number>>(new Set());
  const formDefaultsSeededRef = useRef(false);

  const [setAmount, setSetAmount] = useState("");
  const [setCurrency, setSetCurrency] = useState("CHF");
  const [setRate, setSetRate] = useState("1");
  const [setFrom, setSetFrom] = useState<string>("");
  const [setTo, setSetTo] = useState<string>("");
  const [setNote, setSetNote] = useState("");
  const [settlementRateLoading, setSettlementRateLoading] = useState(false);
  const [recordBusyKey, setRecordBusyKey] = useState<string | null>(null);

  const [importDocs, setImportDocs] = useState<{
    tripDocuments: ImportDoc[];
    paperlessItems: ImportDoc[];
  }>({ tripDocuments: [], paperlessItems: [] });
  const [importPayer, setImportPayer] = useState<string>("");

  const [trips, setTrips] = useState<TripOption[]>([]);
  const [linkTripId, setLinkTripId] = useState<string>("");
  const [tripRenameTitle, setTripRenameTitle] = useState("");
  const [tripRenameBusy, setTripRenameBusy] = useState(false);
  const [ledgerRenameTitle, setLedgerRenameTitle] = useState("");
  const [ledgerRenameBusy, setLedgerRenameBusy] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json);
      if (!formDefaultsSeededRef.current) {
        setExpCurrency(json.ledger.base_currency);
        setSetCurrency(json.ledger.base_currency);
        setSetRate("1");
        formDefaultsSeededRef.current = true;
      }
      if (json.members?.length && !expPayer) {
        setExpPayer(String(json.members[0].id));
        setImportPayer(String(json.members[0].id));
        setSetFrom(String(json.members[0].id));
      }
      if (json.members?.length) {
        setExpSplit((prev) => {
          if (prev.mode === "equal" && prev.memberIds.length > 0) return prev;
          if (prev.mode === "coupleEqual" && prev.coupleIds.length > 0) return prev;
          return {
            mode: "equal",
            memberIds: json.members.map((m: { id: number }) => m.id),
          };
        });
      }
      setLinkTripId(
        json.ledger.trip_id != null ? String(json.ledger.trip_id) : ""
      );
      setLedgerRenameTitle(json.ledger.title || "");
      if (json.ledger.cover_prompt) {
        setCoverPrompt(json.ledger.cover_prompt);
      }
      if (json.ledger.trip_title) {
        setTripRenameTitle(json.ledger.trip_title);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [expPayer, ledgerId]);

  const loadImport = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/import`);
      const json = await res.json();
      if (res.ok) {
        setImportDocs({
          tripDocuments: json.tripDocuments || [],
          paperlessItems: json.paperlessItems || [],
        });
      }
    } catch {
      /* optional */
    }
  }, [ledgerId]);

  const loadTrips = useCallback(async () => {
    try {
      const res = await fetch("/api/trips");
      const json = await res.json();
      if (res.ok) {
        setTrips(
          (json.trips || []).map((t: { id: number; title: string }) => ({
            id: t.id,
            title: t.title,
          }))
        );
      }
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadImport();
    void loadTrips();
  }, [load, loadImport, loadTrips]);

  useEffect(() => {
    if (!data || aiImageBusyId != null) return;
    const missing = data.expenses.find(
      (e) => !e.ai_image_url && !aiAttemptedRef.current.has(e.id)
    );
    if (!missing) return;
    aiAttemptedRef.current.add(missing.id);
    void generateAiImage(missing.id, missing.place_name);
    // Intentionally only depend on data/busy — generateAiImage closes over latest ledgerId.
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
      if (target === "expense") setStatus("Basiswährung – Kurs = 1");
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
      if (target === "expense") {
        setStatus(
          `EZB-Kurs ${from} → ${data.ledger.base_currency}: ${json.rate} (${json.date})`
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function linkTrip(tripId: number | null) {
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Verknüpfung fehlgeschlagen");
      setStatus(
        tripId
          ? "Abrechnung mit Reise verknüpft."
          : "Reise-Verknüpfung entfernt."
      );
      await load();
      await loadImport();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function renameLinkedTrip() {
    const tripId = Number(linkTripId || data?.ledger.trip_id);
    const next = tripRenameTitle.trim();
    if (!Number.isInteger(tripId) || tripId <= 0 || !next) return;
    setTripRenameBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Umbenennen fehlgeschlagen");
      setStatus(`Reise umbenannt in «${next}».`);
      await loadTrips();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTripRenameBusy(false);
    }
  }

  async function renameLedger() {
    const next = ledgerRenameTitle.trim();
    if (!next || next === data?.ledger.title) return;
    setLedgerRenameBusy(true);
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Umbenennen fehlgeschlagen");
      setStatus(`Abrechnung umbenannt in «${next}».`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLedgerRenameBusy(false);
    }
  }

  async function uploadCover(file: File) {
    setCoverBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/cover`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload fehlgeschlagen");
      await load();
      setStatus("Titelbild hochgeladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCoverBusy(false);
    }
  }

  async function generateCover() {
    setCoverBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generate: true,
          prompt: coverPrompt || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generierung fehlgeschlagen");
      await load();
      setStatus("Titelbild erzeugt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCoverBusy(false);
    }
  }

  async function downloadCover() {
    setError(null);
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/cover?download=1`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Download fehlgeschlagen");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || "titelbild.png";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addMember() {
    if (!memberName.trim()) return;
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: memberName.trim(),
          email: memberEmail.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setMemberName("");
      setMemberEmail("");
      setStatus(`Teilnehmer «${json.member.display_name}» hinzugefügt.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createCouple() {
    if (couplePick.length === 0 || couplePick.length > 2) {
      setError("Bitte eine oder zwei Personen für das Paar wählen");
      return;
    }
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/couples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: coupleName.trim() || undefined,
          memberIds: couplePick,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setCouplePick([]);
      setCoupleName("");
      setStatus(`Paar «${json.couple.name}» angelegt.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteCouple(coupleId: number) {
    if (!window.confirm("Paar auflösen? Personen bleiben erhalten.")) return;
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/couples/${coupleId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setStatus("Paar aufgelöst.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyShareUrl(path: string) {
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setStatus("Link kopiert.");
  }

  async function rotateToken(memberId: number) {
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rotateToken: true }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setStatus("Einladungs-Link erneuert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addExpense() {
    const amount = Number(expAmount);
    const isNormal = data?.ledger.ledger_kind === "normal";
    if (!amount) return;
    if (!isNormal && !expPayer) return;
    const splitOk =
      expSplit.mode === "coupleEqual"
        ? expSplit.coupleIds.length > 0
        : expSplit.memberIds.length > 0;
    if (!isNormal && !splitOk) {
      setError(
        expSplit.mode === "coupleEqual"
          ? "Mindestens ein Paar wählen"
          : "Mindestens eine beteiligte Person wählen"
      );
      return;
    }
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNormal
            ? { direction: expDirection }
            : {
                paidByMemberId: Number(expPayer),
                split: expSplit,
                direction: "expense",
              }),
          amount,
          currency: expCurrency,
          exchangeRate: Number(expRate) || 1,
          description: expDesc.trim() || null,
          expenseDate: expDate || null,
          place: expPlace.trim() || null,
          note: expNote.trim() || null,
          tripEventId: expTripEventId,
          ...(!isNormal ? { preSettled: expPreSettled } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      if (pendingReceipt && json.expense?.id) {
        const form = new FormData();
        form.set("file", pendingReceipt);
        const up = await fetch(
          `/api/finance-ledgers/${ledgerId}/expenses/${json.expense.id}/receipt`,
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
      setExpTripEventId(null);
      setExpCurrency(data?.ledger.base_currency ?? "CHF");
      setExpRate("1");
      setExpDirection("expense");
      setExpPreSettled(false);
      setPendingReceipt(null);
      if (data?.members?.length) {
        setExpSplit({
          mode: "equal",
          memberIds: data.members.map((m) => m.id),
        });
      }
      setStatus(
        json.preSettled
          ? "Ausgabe nacherfasst – Anteile als Rückzahlungen ausgeglichen."
          : "Ausgabe erfasst."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function generateAiImage(expenseId: number, place?: string | null) {
    setAiImageBusyId(expenseId);
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}/ai-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useSettings: true, place: place ?? undefined }),
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
        `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}/ai-image`,
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
        `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}/notify`,
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

  async function sendExpensesSummaryMail() {
    setSummaryMailBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/expenses-summary-mail`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mailversand fehlgeschlagen");
      const sent = typeof json.sent === "number" ? json.sent : 0;
      setStatus(
        sent > 0
          ? `Ausgaben-Übersicht gesendet (${sent} Empfänger).`
          : "Ausgaben-Übersicht gesendet."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummaryMailBusy(false);
    }
  }

  async function openTripSummaryDialog() {
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/trip-summary-mail`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Empfänger laden fehlgeschlagen");
      }
      const list = (json.recipients || []) as Array<{
        memberId: number;
        displayName: string;
        email: string;
      }>;
      if (list.length === 0) {
        throw new Error("Keine Teilnehmer mit E-Mail-Adresse");
      }
      setTripSummaryRecipients(list);
      setTripSummarySelected(list.map((r) => r.memberId));
      setTripSummaryOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendTripSummaryMail() {
    if (tripSummarySelected.length === 0) return;
    setTripSummaryBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/trip-summary-mail`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientMemberIds: tripSummarySelected }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Mailversand fehlgeschlagen");
      const sent = typeof json.sent === "number" ? json.sent : 0;
      setTripSummaryOpen(false);
      setStatus(
        sent > 0
          ? `Reise-Übersicht gesendet (${sent} Empfänger).`
          : "Reise-Übersicht gesendet."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTripSummaryBusy(false);
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
      direction?: "expense" | "income";
      tripEventId?: number | null;
      split?: ExpenseSplitSelection;
    }
  ) {
    setEditBusyId(expenseId);
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}`,
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
            direction: payload.direction,
            tripEventId: payload.tripEventId,
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
        `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}`,
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
    if (!amount || !setFrom || !setTo || !data) return;
    if (setFrom === setTo) {
      setError("Zahler und Empfänger müssen unterschiedlich sein.");
      return;
    }
    const creditorNet =
      data.balances.find((b) => b.memberId === Number(setTo))?.netBalance ?? 0;
    const toName =
      data.members.find((m) => m.id === Number(setTo))?.display_name ??
      "Empfänger";
    const fromName =
      data.members.find((m) => m.id === Number(setFrom))?.display_name ??
      "Zahler";
    const amountBase =
      setCurrency === data.ledger.base_currency
        ? amount
        : amount * (Number(setRate) || 1);
    const confirmed = confirmSettlementAmount({
      fromName,
      toName,
      suggested: amountBase,
      creditorNet,
      currency: data.ledger.base_currency,
    });
    if (confirmed == null) return;
    const postAmount =
      setCurrency === data.ledger.base_currency ? confirmed : amount;
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromMemberId: Number(setFrom),
          toMemberId: Number(setTo),
          amount: postAmount,
          currency: setCurrency,
          exchangeRate: Number(setRate) || 1,
          note: setNote.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setSetAmount("");
      setSetNote("");
      setSetCurrency(data.ledger.base_currency);
      setSetRate("1");
      if (typeof json.warning === "string" && json.warning) {
        setError(json.warning);
        setStatus("Rückzahlung erfasst – Belegmail fehlgeschlagen.");
      } else {
        setStatus("Rückzahlung erfasst – Saldo aktualisiert.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function recordSuggestedDebt(debt: BalanceDebt) {
    if (!data) return;
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
    const busyKey = `debt-${debt.fromMemberId}-${debt.toMemberId}`;
    setRecordBusyKey(busyKey);
    setError(null);
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromMemberId: debt.fromMemberId,
          toMemberId: debt.toMemberId,
          amount,
          currency,
          exchangeRate: 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      if (typeof json.warning === "string" && json.warning) {
        setError(json.warning);
        setStatus("Rückzahlung erfasst – Belegmail fehlgeschlagen.");
      } else {
        setStatus(
          `Rückzahlung ${debt.fromDisplayName} → ${debt.toDisplayName} erfasst.`
        );
      }
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
        `/api/finance-ledgers/${ledgerId}/settlements/${settlementId}`,
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
        `/api/finance-ledgers/${ledgerId}/settlements/${settlementId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteExpense(expenseId: number) {
    if (!window.confirm("Ausgabe löschen?")) return;
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function importDocument(doc: ImportDoc) {
    const isNormal = data?.ledger.ledger_kind === "normal";
    if (!isNormal && !importPayer) return;
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.document_id,
          ...(isNormal
            ? { direction: "expense" }
            : { paidByMemberId: Number(importPayer) }),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import fehlgeschlagen");
      if (json.expense?.id) {
        aiAttemptedRef.current.add(json.expense.id);
        void generateAiImage(json.expense.id);
      }
      setStatus("Beleg importiert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendReminders() {
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      const sent = (json.results || []).filter(
        (r: { ok: boolean }) => r.ok
      ).length;
      setStatus(
        json.emailConfigured
          ? `${sent} Erinnerung(en) gesendet.`
          : "E-Mail nicht konfiguriert – mailto-Links in Teilnehmer-Karten nutzen."
      );
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
    setExpDirection(exp.direction === "income" ? "income" : "expense");
    setExpTripEventId(exp.trip_event?.id ?? exp.trip_event_id ?? null);
    setExpSplit({
      mode: "equal",
      memberIds: exp.splits.map((s) => s.member_id),
    });
    setExpPreSettled(false);
    setPendingReceipt(null);
    setError(null);
    setStatus(
      "Vorlage geladen — anpassen und als neue Buchung speichern."
    );
    setTab("new");
  }

  if (loading && !data) {
    return <p className="p-6 text-sm text-muted-foreground">Lade Abrechnung…</p>;
  }
  if (!data) {
    return (
      <p className="p-6 text-sm text-destructive">
        {error || "Abrechnung nicht gefunden."}
      </p>
    );
  }

  const {
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
    cashbook,
    costDashboard,
  } = data;
  const isNormal = ledger.ledger_kind === "normal";
  const isSplit = !isNormal;
  const activeTab = parseFinanceLedgerTab(searchParams.get("tab"), {
    isSplit,
  });
  const tabItems: FinanceTabItem[] = isSplit
    ? [
        { id: "overview", label: "Übersicht", icon: LayoutDashboard },
        { id: "new", label: "Neu", icon: Plus, emphasize: true },
        { id: "expenses", label: "Ausgaben", icon: List },
        { id: "settle", label: "Ausgleich", icon: ArrowLeftRight },
        { id: "more", label: "Mehr", icon: MoreHorizontal },
      ]
    : [
        { id: "overview", label: "Übersicht", icon: LayoutDashboard },
        { id: "new", label: "Neu", icon: Plus, emphasize: true },
        { id: "expenses", label: "Buchungen", icon: List },
        { id: "more", label: "Mehr", icon: MoreHorizontal },
      ];
  const hasImport =
    importDocs.tripDocuments.length > 0 ||
    importDocs.paperlessItems.length > 0;
  const memberSelectItems = Object.fromEntries(
    members.map((m) => [String(m.id), m.display_name])
  );
  const tripSelectItems = {
    __none__: "Keine Reise",
    ...Object.fromEntries(trips.map((t) => [String(t.id), t.title])),
  };
  const currencySelectItems = Object.fromEntries(
    COMMON_CURRENCIES.map((c) => [c, c])
  );
  const kindLabel = LEDGER_KIND_LABELS[isNormal ? "normal" : "split"];

  return (
    <div className="space-y-4 pb-28 md:space-y-6 md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/finance-brain"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="mr-1 size-4" />
          Zurück
        </Link>
        {ledger.trip_id ? (
          <Link
            href={`/trips/${ledger.trip_id}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "hidden sm:inline-flex"
            )}
          >
            Reise öffnen
          </Link>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => void load()}
        >
          <RefreshCw className="mr-1 size-4" />
          Aktualisieren
        </Button>
        {!isNormal ? (
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => void sendReminders()}
          >
            <Bell className="mr-1 size-4" />
            Saldo-Erinnerungen
          </Button>
        ) : null}
      </div>

      <PageHeader
        title={ledger.title}
        description={
          ledger.trip_title
            ? `${kindLabel} · ${ledger.base_currency} · ${ledger.trip_title}`
            : `${kindLabel} · ${ledger.base_currency}`
        }
        icon={pageVisuals.financeBrain.icon}
        tone={pageVisuals.financeBrain.tone}
      />

      <div
        className="relative h-40 overflow-hidden rounded-xl bg-gradient-to-br from-[var(--brand-finance-soft)] to-emerald-100 bg-cover bg-center sm:h-52"
        style={
          ledger.cover_url
            ? { backgroundImage: `url(${ledger.cover_url})` }
            : undefined
        }
      />

      <FinanceTabNav items={tabItems} active={activeTab} onChange={setTab} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      {activeTab === "overview" ? (
        !isNormal ? (
          <div className="space-y-4">
            {ledger.trip_id && costDashboard ? (
              <TripCostDashboard data={costDashboard} />
            ) : null}
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
            <BalanceView
              balances={balances}
              simplifiedDebts={simplifiedDebts}
              minimalDebts={minimalDebts}
              coupleBalances={coupleBalances}
              coupleDebts={coupleDebts}
              baseCurrency={ledger.base_currency}
              onRecordDebt={recordSuggestedDebt}
              recordBusyKey={recordBusyKey}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <SectionCard title="Übersicht" tone="green" icon={Receipt}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Ausgaben</p>
                  <p className="text-lg font-semibold">
                    {formatMoney(
                      cashbook?.expenseTotalBase ?? 0,
                      ledger.base_currency
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Einnahmen</p>
                  <p className="text-lg font-semibold text-[var(--brand-finance)]">
                    {formatMoney(
                      cashbook?.incomeTotalBase ?? 0,
                      ledger.base_currency
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-white px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="text-lg font-semibold">
                    {formatSignedMoney(
                      cashbook?.netBase ?? 0,
                      ledger.base_currency
                    )}
                  </p>
                </div>
              </div>
            </SectionCard>
            <LedgerOverviewDashboards
              expenses={expenses}
              settlements={[]}
              members={members.map((m) => ({
                id: m.id,
                display_name: m.display_name,
              }))}
              openDebts={[]}
              baseCurrency={ledger.base_currency}
              showOpenSettled={false}
              showPersonMix={false}
              onOpenExpense={(expenseId) => {
                setTab("expenses");
                window.setTimeout(() => scrollToExpenseCard(expenseId), 120);
              }}
            />
          </div>
        )
      ) : null}

      {activeTab === "new" ? (
        <SectionCard
          title={isNormal ? "Buchung erfassen" : "Ausgabe erfassen"}
          tone="green"
          icon={Receipt}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {isNormal ? (
              <div className="space-y-1">
                <Label>Typ</Label>
                <Select
                  value={expDirection}
                  onValueChange={(v) => {
                    if (v == null) return;
                    setExpDirection(v as "expense" | "income");
                  }}
                  items={{ expense: "Ausgabe", income: "Einnahme" }}
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
            ) : null}
            <div className="space-y-1">
              <Label>Betrag</Label>
              <Input
                type="number"
                step="0.01"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
              />
            </div>
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
                  title="EZB-Kurs laden (Frankfurter)"
                  disabled={rateLoading || expCurrency === ledger.base_currency}
                  onClick={() => void fetchEcbRate()}
                >
                  <Download
                    className={cn("size-4", rateLoading && "animate-pulse")}
                  />
                </Button>
              </div>
            </div>
            {!isNormal ? (
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
                    <SelectValue placeholder="Person" />
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
            ) : null}
            {!isNormal ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <ExpenseSplitParticipants
                  members={members}
                  couples={couples}
                  value={expSplit}
                  onChange={setExpSplit}
                />
              </div>
            ) : null}
            {!isNormal ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-sm sm:col-span-2 lg:col-span-4">
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
            ) : null}
            <div className="space-y-1 sm:col-span-2">
              <Label>Beschreibung</Label>
              <Input
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Ort (optional)</Label>
              <Input
                value={expPlace}
                onChange={(e) => setExpPlace(e.target.value)}
                placeholder="Restaurant, Stadt…"
              />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
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
            <div className="sm:col-span-2 lg:col-span-4">
              <ExpenseTripEventPicker
                trips={trips}
                lockedTripId={ledger.trip_id}
                value={expTripEventId}
                onChange={setExpTripEventId}
              />
            </div>
            {expCurrency !== ledger.base_currency && Number(expAmount) > 0 ? (
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                Fremdwährung {expCurrency}: {expAmount} → ≈{" "}
                {(Number(expAmount) * (Number(expRate) || 1)).toFixed(2)}{" "}
                {ledger.base_currency} (Kurs {expRate || "—"})
              </p>
            ) : null}
            <div className="flex items-end">
              <Button
                className="w-full sm:w-auto"
                onClick={() => void addExpense()}
                disabled={
                  !expAmount ||
                  (!isNormal &&
                    !(expSplit.mode === "coupleEqual"
                      ? expSplit.coupleIds.length > 0
                      : expSplit.memberIds.length > 0))
                }
              >
                Speichern
              </Button>
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
              <Label>Belegfoto (optional)</Label>
              <PendingReceiptPicker
                file={pendingReceipt}
                onChange={setPendingReceipt}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {isNormal
              ? "Einfache Ein- und Ausgaben ohne Split oder Ausgleich."
              : "Aufteilung gleichmässig unter den ausgewählten Beteiligten. Kurs-Button lädt den EZB-Referenzkurs (optional zum Ausgabedatum)."}
          </p>
        </SectionCard>
      ) : null}

      {activeTab === "expenses" ? (
        <SectionCard
          title={isNormal ? "Buchungen" : "Ausgaben"}
          tone="green"
          icon={Receipt}
        >
          <ExpenseList
            expenses={expenses}
            members={members}
            couples={couples}
            baseCurrency={ledger.base_currency}
            cashbookMode={isNormal}
            canDelete
            canEdit
            trips={
              ledger.trip_id != null &&
              !trips.some((t) => t.id === ledger.trip_id)
                ? [
                    {
                      id: ledger.trip_id,
                      title: ledger.trip_title || `Reise #${ledger.trip_id}`,
                    },
                    ...trips,
                  ]
                : trips
            }
            lockedTripId={ledger.trip_id}
            onDelete={(id) => void deleteExpense(id)}
            receiptUploadUrl={(expenseId) =>
              `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}/receipt`
            }
            onReceiptChanged={() => void load()}
            onGenerateAiImage={(id) => void generateAiImage(id)}
            onDeleteAiImage={(id) => void deleteAiImage(id)}
            onResendMail={
              isNormal ? undefined : (id) => void resendExpenseMail(id)
            }
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

      {activeTab === "settle" && !isNormal ? (
        <div className="space-y-4">
          <SectionCard title="Rückzahlung" tone="green" icon={ArrowLeftRight}>
            <p className="mb-3 text-sm text-muted-foreground">
              Wer hat wem Geld zurückbezahlt? («Von» = Person, die zahlt und
              damit ihre Schuld reduziert.)
            </p>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Von (zahlt)</Label>
                <Select
                  value={setFrom}
                  onValueChange={(v) => {
                    if (v == null) return;
                    setSetFrom(v);
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
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>An (empfängt)</Label>
                <Select
                  value={setTo}
                  onValueChange={(v) => {
                    if (v == null) return;
                    setSetTo(v);
                  }}
                  items={memberSelectItems}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Empfänger" />
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
                <Label>Betrag</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={setAmount}
                  onChange={(e) => setSetAmount(e.target.value)}
                />
              </div>
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
                    onChange={(e) => setSetRate(e.target.value)}
                    disabled={setCurrency === ledger.base_currency}
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
                    onClick={() => void fetchEcbRate({ target: "settlement" })}
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
              <div className="flex items-end">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => void addSettlement()}
                  disabled={!setAmount || !setFrom || !setTo}
                >
                  Erfassen
                </Button>
              </div>
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
                      <p className="text-xs text-amber-800 sm:col-span-4">
                        Betrag übersteigt das offene Netto von {toName} (
                        {formatMoney(cap.creditorNet, ledger.base_currency)}).
                        Beim Erfassen wird auf{" "}
                        {formatMoney(cap.amount, ledger.base_currency)}{" "}
                        begrenzt (Bestätigung).
                      </p>
                    );
                  })()
                : null}
              <div className="space-y-1 sm:col-span-4">
                <Label>Notiz</Label>
                <Textarea
                  rows={2}
                  value={setNote}
                  onChange={(e) => setSetNote(e.target.value)}
                />
              </div>
            </div>
          </SectionCard>

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

      {activeTab === "more" ? (
        <div className="space-y-4">
          <SectionCard title="Abrechnung umbenennen" tone="green" icon={Pencil}>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label htmlFor="ledger-rename">Name der Abrechnung</Label>
                <Input
                  id="ledger-rename"
                  value={ledgerRenameTitle}
                  onChange={(e) => setLedgerRenameTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void renameLedger();
                    }
                  }}
                />
              </div>
              <Button
                variant="outline"
                disabled={
                  ledgerRenameBusy ||
                  !ledgerRenameTitle.trim() ||
                  ledgerRenameTitle.trim() === ledger.title
                }
                onClick={() => void renameLedger()}
              >
                <Pencil className="mr-1 size-4" />
                Speichern
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Titelbild" tone="green" icon={ImagePlus}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ledger-cover-file">Hochladen</Label>
                <Input
                  id="ledger-cover-file"
                  type="file"
                  accept="image/*"
                  disabled={coverBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadCover(file);
                  }}
                />
              </div>
              <div className="min-w-0 w-full flex-1 space-y-1.5 sm:min-w-[16rem]">
                <Label htmlFor="ledger-cover-prompt">AI-Prompt (optional)</Label>
                <Input
                  id="ledger-cover-prompt"
                  value={coverPrompt}
                  onChange={(e) => setCoverPrompt(e.target.value)}
                  placeholder="z. B. Freunde teilen Rechnung im Café, flache Illustration"
                  disabled={coverBusy}
                />
              </div>
              <Button
                variant="outline"
                disabled={coverBusy}
                onClick={() => void generateCover()}
                className="gap-1.5"
              >
                <Sparkles className="size-4" />
                Mit AI erzeugen
              </Button>
              <Button
                variant="outline"
                disabled={coverBusy || !ledger.cover_url}
                onClick={() => void downloadCover()}
                className="gap-1.5"
              >
                <Download className="size-4" />
                Herunterladen
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Reise verknüpfen" tone="green" icon={Luggage}>
            <p className="mb-3 text-sm text-muted-foreground">
              Optional mit einer TravelBuddy-Reise verbinden – dann erscheinen
              Reise-Belege zum Import und die Abrechnung auf der
              Reise-Detailseite.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label>Reise</Label>
                <Select
                  value={linkTripId || "__none__"}
                  onValueChange={(v) => {
                    if (v == null || v === "__none__") {
                      setLinkTripId("");
                      setTripRenameTitle("");
                      return;
                    }
                    setLinkTripId(v);
                    const match = trips.find((t) => String(t.id) === v);
                    setTripRenameTitle(match?.title || "");
                  }}
                  items={tripSelectItems}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Keine Reise" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keine Reise</SelectItem>
                    {trips.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  void linkTrip(linkTripId ? Number(linkTripId) : null)
                }
              >
                <Link2 className="mr-1 size-4" />
                Speichern
              </Button>
              {ledger.trip_id ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLinkTripId("");
                    setTripRenameTitle("");
                    void linkTrip(null);
                  }}
                >
                  <Unlink className="mr-1 size-4" />
                  Trennen
                </Button>
              ) : null}
            </div>

            {linkTripId ? (
              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/50 pt-4">
                <div className="min-w-[200px] flex-1 space-y-1">
                  <Label htmlFor="trip-rename">Reise umbenennen</Label>
                  <Input
                    id="trip-rename"
                    value={tripRenameTitle}
                    onChange={(e) => setTripRenameTitle(e.target.value)}
                    placeholder="Neuer Name der TravelBuddy-Reise"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void renameLinkedTrip();
                      }
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={
                    tripRenameBusy ||
                    !tripRenameTitle.trim() ||
                    tripRenameTitle.trim() ===
                      (trips.find((t) => String(t.id) === linkTripId)?.title ||
                        ledger.trip_title ||
                        "")
                  }
                  onClick={() => void renameLinkedTrip()}
                >
                  <Pencil className="mr-1 size-4" />
                  Umbenennen
                </Button>
              </div>
            ) : null}
          </SectionCard>

          {!isNormal ? (
            <SectionCard title="Ausgaben-Mail" tone="green" icon={Mail}>
              <p className="mb-3 text-sm text-muted-foreground">
                Alle Ausgaben per Mail inkl. PDF an die Gruppe senden.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={summaryMailBusy || expenses.length === 0}
                  onClick={() => void sendExpensesSummaryMail()}
                >
                  <Mail
                    className={cn(
                      "size-4",
                      summaryMailBusy && "animate-pulse"
                    )}
                  />
                  {summaryMailBusy ? "Sendet…" : "Ausgaben-Mail senden"}
                </Button>
                {ledger.trip_id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={tripSummaryBusy || expenses.length === 0}
                    onClick={() => void openTripSummaryDialog()}
                  >
                    <Luggage className="size-4" />
                    Reise-Übersicht senden
                  </Button>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {!isNormal ? (
            <SectionCard
              title="Teilnehmer & Einladungs-Links"
              tone="green"
              icon={Users}
            >
              <p className="mb-3 text-sm text-muted-foreground">
                E-Mail-Adresse eintragen, damit Beleg-Mails (Ausgabe /
                Rückzahlung) an die ganze Gruppe gehen können.
              </p>
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Name"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                />
                <Input
                  placeholder="E-Mail (für Beleg-Mails)"
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                />
                <Button
                  onClick={() => void addMember()}
                  disabled={!memberName.trim()}
                >
                  <Plus className="mr-1 size-4" />
                  Hinzufügen
                </Button>
              </div>
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{m.display_name}</span>
                    {m.couple_name ? (
                      <Badge variant="secondary">Paar: {m.couple_name}</Badge>
                    ) : null}
                    {m.email ? (
                      <Badge variant="secondary">{m.email}</Badge>
                    ) : null}
                    {m.invite_revoked_at ? (
                      <Badge variant="destructive">Widerrufen</Badge>
                    ) : null}
                    <div className="ml-auto flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyShareUrl(m.share_url)}
                      >
                        <Copy className="mr-1 size-3" />
                        Link
                      </Button>
                      <a
                        href={`mailto:?subject=${encodeURIComponent(`FinanzBuddy: ${ledger.title}`)}&body=${encodeURIComponent(`Dein Link: ${typeof window !== "undefined" ? window.location.origin : ""}${m.share_url}`)}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" })
                        )}
                      >
                        <Mail className="mr-1 size-3" />
                        mailto
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void rotateToken(m.id)}
                      >
                        <RotateCw className="mr-1 size-3" />
                        Token
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-3 border-t border-border/50 pt-4">
                <p className="text-sm font-medium">Paare (2×2)</p>
                <p className="text-xs text-muted-foreground">
                  Für Saldo je Paar und Ausgleich zwischen Paaren. Max. zwei
                  Personen pro Paar.
                </p>
                {couples.length > 0 ? (
                  <ul className="space-y-1.5">
                    {couples.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">{c.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.memberIds
                              .map(
                                (id) =>
                                  members.find((m) => m.id === id)
                                    ?.display_name ?? `#${id}`
                              )
                              .join(", ")}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => void deleteCouple(c.id)}
                        >
                          Auflösen
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Noch keine Paare.
                  </p>
                )}
                <div className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-2.5">
                  <Input
                    placeholder="Paar-Name (optional, z. B. Rolf & Eliane)"
                    value={coupleName}
                    onChange={(e) => setCoupleName(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {members
                      .filter((m) => !m.couple_id)
                      .map((m) => {
                        const checked = couplePick.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={
                              !checked && couplePick.length >= 2
                            }
                            className={cn(
                              "rounded-md border px-2 py-1 text-xs",
                              checked
                                ? "border-[var(--brand-finance)] bg-[var(--brand-finance-soft)]"
                                : "border-border/60"
                            )}
                            onClick={() =>
                              setCouplePick((prev) =>
                                checked
                                  ? prev.filter((id) => id !== m.id)
                                  : prev.length >= 2
                                    ? prev
                                    : [...prev, m.id]
                              )
                            }
                          >
                            {m.display_name}
                          </button>
                        );
                      })}
                  </div>
                  <Button
                    size="sm"
                    disabled={couplePick.length === 0}
                    onClick={() => void createCouple()}
                  >
                    <Plus className="mr-1 size-3.5" />
                    Paar anlegen
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void sendReminders()}
                >
                  <Bell className="mr-1 size-4" />
                  Saldo-Erinnerungen
                </Button>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Belege importieren" tone="green" icon={FileDown}>
            {!hasImport ? (
              <p className="text-sm text-muted-foreground">
                Keine Belege gefunden. Verknüpfe eine Reise (oben) für
                Reise-Belege, oder warte auf Paperless-Finanzpositionen.
              </p>
            ) : (
              <>
                {!isNormal ? (
                  <div className="mb-3 space-y-1">
                    <Label>Bezahlt von</Label>
                    <Select
                      value={importPayer}
                      onValueChange={(v) => {
                        if (v == null) return;
                        setImportPayer(v);
                      }}
                      items={memberSelectItems}
                    >
                      <SelectTrigger className="max-w-xs">
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
                ) : null}
                {importDocs.tripDocuments.length > 0 ? (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reise-Belege
                    </p>
                    {importDocs.tripDocuments.map((doc) => (
                      <ImportRow
                        key={`trip-${doc.document_id}`}
                        doc={doc}
                        baseCurrency={ledger.base_currency}
                        onImport={() => void importDocument(doc)}
                      />
                    ))}
                  </div>
                ) : null}
                {importDocs.paperlessItems.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Paperless (Finanzblick)
                    </p>
                    {importDocs.paperlessItems.slice(0, 20).map((doc) => (
                      <ImportRow
                        key={`pl-${doc.document_id}`}
                        doc={doc}
                        baseCurrency={ledger.base_currency}
                        onImport={() => void importDocument(doc)}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </SectionCard>
        </div>
      ) : null}

      <Dialog open={tripSummaryOpen} onOpenChange={setTripSummaryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reise-Übersicht per Mail</DialogTitle>
            <DialogDescription>
              {ledger.trip_title || ledger.title} — HTML und PDF mit allen
              Ausgaben, Summe und Netto-Übersicht.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Wer soll die Mail bekommen?</p>
            {tripSummaryRecipients.map((r) => {
              const checked = tripSummarySelected.includes(r.memberId);
              return (
                <label
                  key={r.memberId}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-sm hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setTripSummarySelected((prev) =>
                        checked
                          ? prev.filter((id) => id !== r.memberId)
                          : [...prev, r.memberId]
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.email}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={tripSummaryBusy}
              onClick={() => setTripSummaryOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              disabled={tripSummaryBusy || tripSummarySelected.length === 0}
              onClick={() => void sendTripSummaryMail()}
              className="bg-[var(--brand-finance)] text-white hover:bg-[var(--brand-finance)]/90"
            >
              {tripSummaryBusy
                ? "Sendet…"
                : `Senden (${tripSummarySelected.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImportRow({
  doc,
  baseCurrency,
  onImport,
}: {
  doc: ImportDoc;
  baseCurrency: string;
  onImport: () => void;
}) {
  const label =
    [doc.vendor, doc.title].filter(Boolean).join(" · ") ||
    doc.title ||
    `Beleg #${doc.document_id}`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
      <Link2 className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {doc.amount != null
            ? `${doc.amount} ${doc.currency || baseCurrency}`
            : "Betrag unbekannt"}
          {doc.trip_event_title ? ` · ${doc.trip_event_title}` : ""}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onImport}>
        Importieren
      </Button>
    </div>
  );
}
