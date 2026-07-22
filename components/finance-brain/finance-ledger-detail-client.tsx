"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileDown,
  Link2,
  Luggage,
  Mail,
  Plus,
  Receipt,
  RefreshCw,
  RotateCw,
  ArrowLeftRight,
  Unlink,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
} from "@/components/finance-brain/balance-view";
import { PendingReceiptPicker } from "@/components/finance-brain/expense-receipt-controls";
import { COMMON_CURRENCIES } from "@/lib/finance-brain/constants";
import { cn } from "@/lib/utils";
import { todayDateInputValue } from "@/lib/utils/dates";

type Member = {
  id: number;
  display_name: string;
  email: string | null;
  share_url: string;
  invite_token?: string;
  invite_revoked_at: string | null;
};

type LedgerDetail = {
  ledger: {
    id: number;
    title: string;
    base_currency: string;
    trip_id: number | null;
    trip_title: string | null;
  };
  members: Member[];
  expenses: Array<{
    id: number;
    description: string | null;
    amount: number;
    currency: string;
    amount_base: number;
    expense_date: string | null;
    paid_by_member_id: number;
    category_label?: string | null;
    category_tone?: string | null;
    place_name?: string | null;
    place_lat?: number | null;
    place_lon?: number | null;
    receipt_url?: string | null;
    has_receipt?: boolean;
    ai_image_url?: string | null;
    has_ai_image?: boolean;
    splits: Array<{ member_id: number; share_amount_base: number }>;
  }>;
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

type Panel = "none" | "members" | "import";

export function FinanceLedgerDetailClient({ ledgerId }: { ledgerId: number }) {
  const [data, setData] = useState<LedgerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");

  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");

  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState("CHF");
  const [expRate, setExpRate] = useState("1");
  const [expDesc, setExpDesc] = useState("");
  const [expDate, setExpDate] = useState(todayDateInputValue);
  const [expPlace, setExpPlace] = useState("");
  const [expPayer, setExpPayer] = useState<string>("");
  const [rateLoading, setRateLoading] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [aiImageBusyId, setAiImageBusyId] = useState<number | null>(null);
  const [editBusyId, setEditBusyId] = useState<number | null>(null);
  const aiAttemptedRef = useRef<Set<number>>(new Set());

  const [setAmount, setSetAmount] = useState("");
  const [setFrom, setSetFrom] = useState<string>("");
  const [setTo, setSetTo] = useState<string>("");
  const [setNote, setSetNote] = useState("");

  const [importDocs, setImportDocs] = useState<{
    tripDocuments: ImportDoc[];
    paperlessItems: ImportDoc[];
  }>({ tripDocuments: [], paperlessItems: [] });
  const [importPayer, setImportPayer] = useState<string>("");

  const [trips, setTrips] = useState<TripOption[]>([]);
  const [linkTripId, setLinkTripId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json);
      setExpCurrency(json.ledger.base_currency);
      if (json.members?.length && !expPayer) {
        setExpPayer(String(json.members[0].id));
        setImportPayer(String(json.members[0].id));
        setSetFrom(String(json.members[0].id));
      }
      setLinkTripId(
        json.ledger.trip_id != null ? String(json.ledger.trip_id) : ""
      );
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

  async function fetchEcbRate() {
    if (!data) return;
    if (expCurrency === data.ledger.base_currency) {
      setExpRate("1");
      setStatus("Basiswährung – Kurs = 1");
      return;
    }
    setRateLoading(true);
    try {
      const params = new URLSearchParams({
        from: expCurrency,
        to: data.ledger.base_currency,
      });
      if (expDate) params.set("date", expDate);
      const res = await fetch(`/api/finance-ledgers/exchange-rate?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kurs laden fehlgeschlagen");
      setExpRate(String(json.rate));
      setStatus(
        `EZB-Kurs ${expCurrency} → ${data.ledger.base_currency}: ${json.rate} (${json.date})`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRateLoading(false);
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
    if (!amount || !expPayer) return;
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidByMemberId: Number(expPayer),
          amount,
          currency: expCurrency,
          exchangeRate: Number(expRate) || 1,
          description: expDesc.trim() || null,
          expenseDate: expDate || null,
          place: expPlace.trim() || null,
          split: { mode: "equal" },
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
      setPendingReceipt(null);
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

  async function updateExpense(
    expenseId: number,
    payload: {
      description: string | null;
      expenseDate: string | null;
      paidByMemberId: number;
      place: string | null;
    }
  ) {
    setEditBusyId(expenseId);
    try {
      const res = await fetch(
        `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}`,
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

  async function addSettlement() {
    const amount = Number(setAmount);
    if (!amount || !setFrom || !setTo) return;
    if (setFrom === setTo) {
      setError("Zahler und Empfänger müssen unterschiedlich sein.");
      return;
    }
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromMemberId: Number(setFrom),
          toMemberId: Number(setTo),
          amount,
          currency: data?.ledger.base_currency ?? "CHF",
          note: setNote.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setSetAmount("");
      setSetNote("");
      setStatus("Rückzahlung erfasst – Saldo aktualisiert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function updateSettlement(
    settlementId: number,
    payload: {
      fromMemberId: number;
      toMemberId: number;
      amount: number;
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
          body: JSON.stringify({
            ...payload,
            currency: data?.ledger.base_currency,
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
    if (!importPayer) return;
    try {
      const res = await fetch(`/api/finance-ledgers/${ledgerId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.document_id,
          paidByMemberId: Number(importPayer),
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

  function togglePanel(next: Panel) {
    setPanel((prev) => (prev === next ? "none" : next));
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

  const { ledger, members, expenses, settlements, balances, simplifiedDebts } =
    data;
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

  return (
    <div className="space-y-6">
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
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Reise öffnen
          </Link>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 size-4" />
          Aktualisieren
        </Button>
        <Button variant="outline" size="sm" onClick={() => void sendReminders()}>
          <Bell className="mr-1 size-4" />
          Saldo-Erinnerungen
        </Button>
      </div>

      <PageHeader
        title={ledger.title}
        description={
          ledger.trip_title
            ? `Basiswährung ${ledger.base_currency} · Reise: ${ledger.trip_title}`
            : `Basiswährung ${ledger.base_currency}`
        }
        icon={pageVisuals.financeBrain.icon}
        tone={pageVisuals.financeBrain.tone}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      <SectionCard title="Reise verknüpfen" tone="indigo" icon={Luggage}>
        <p className="mb-3 text-sm text-muted-foreground">
          Optional mit einer TravelBrain-Reise verbinden – dann erscheinen
          Reise-Belege zum Import und die Abrechnung auf der Reise-Detailseite.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label>Reise</Label>
            <Select
              value={linkTripId || "__none__"}
              onValueChange={(v) => {
                if (v == null || v === "__none__") {
                  setLinkTripId("");
                  return;
                }
                setLinkTripId(v);
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
                void linkTrip(null);
              }}
            >
              <Unlink className="mr-1 size-4" />
              Trennen
            </Button>
          ) : null}
        </div>
      </SectionCard>

      <BalanceView
        balances={balances}
        simplifiedDebts={simplifiedDebts}
        baseCurrency={ledger.base_currency}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant={panel === "members" ? "default" : "outline"}
          size="sm"
          onClick={() => togglePanel("members")}
          className="gap-1.5"
        >
          <Users className="size-4" />
          Teilnehmer
          {panel === "members" ? (
            <ChevronUp className="size-3.5 opacity-70" />
          ) : (
            <ChevronDown className="size-3.5 opacity-70" />
          )}
        </Button>
        <Button
          variant={panel === "import" ? "default" : "outline"}
          size="sm"
          onClick={() => togglePanel("import")}
          className="gap-1.5"
        >
          <FileDown className="size-4" />
          Belege importieren
          {panel === "import" ? (
            <ChevronUp className="size-3.5 opacity-70" />
          ) : (
            <ChevronDown className="size-3.5 opacity-70" />
          )}
        </Button>
      </div>

      {panel === "members" ? (
        <SectionCard title="Teilnehmer & Einladungs-Links" tone="sky" icon={Users}>
          <p className="mb-3 text-sm text-muted-foreground">
            E-Mail-Adresse eintragen, damit Beleg-Mails (Ausgabe / Rückzahlung)
            an die ganze Gruppe gehen können.
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
                {m.email ? <Badge variant="secondary">{m.email}</Badge> : null}
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
                    href={`mailto:?subject=${encodeURIComponent(`FinanzBrain: ${ledger.title}`)}&body=${encodeURIComponent(`Dein Link: ${typeof window !== "undefined" ? window.location.origin : ""}${m.share_url}`)}`}
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
        </SectionCard>
      ) : null}

      {panel === "import" ? (
        <SectionCard title="Belege importieren" tone="violet" icon={FileDown}>
          {!hasImport ? (
            <p className="text-sm text-muted-foreground">
              Keine Belege gefunden. Verknüpfe eine Reise (oben) für
              Reise-Belege, oder warte auf Paperless-Finanzpositionen.
            </p>
          ) : (
            <>
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
      ) : null}

      <SectionCard title="Ausgabe erfassen" tone="orange" icon={Receipt}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                if (v === ledger.base_currency) setExpRate("1");
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
          <div className="space-y-1">
            <Label>Datum</Label>
            <Input
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void addExpense()} disabled={!expAmount}>
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
          Aufteilung: gleichmässig auf alle Teilnehmer. Kurs-Button lädt den
          EZB-Referenzkurs (optional zum Ausgabedatum).
        </p>
      </SectionCard>

      <SectionCard title="Rückzahlung" tone="teal" icon={ArrowLeftRight}>
        <p className="mb-3 text-sm text-muted-foreground">
          Wer hat wem Geld zurückbezahlt? («Von» = Person, die zahlt und damit
          ihre Schuld reduziert.)
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
            <Label>Betrag ({ledger.base_currency})</Label>
            <Input
              type="number"
              step="0.01"
              value={setAmount}
              onChange={(e) => setSetAmount(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => void addSettlement()}
              disabled={!setAmount || !setFrom || !setTo}
            >
              Erfassen
            </Button>
          </div>
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

      <SectionCard title="Ausgaben" tone="green" icon={Receipt}>
        <ExpenseList
          expenses={expenses}
          members={members}
          baseCurrency={ledger.base_currency}
          canDelete
          canEdit
          onDelete={(id) => void deleteExpense(id)}
          receiptUploadUrl={(expenseId) =>
            `/api/finance-ledgers/${ledgerId}/expenses/${expenseId}/receipt`
          }
          onReceiptChanged={() => void load()}
          onGenerateAiImage={(id) => void generateAiImage(id)}
          onDeleteAiImage={(id) => void deleteAiImage(id)}
          onUpdateExpense={(id, payload) => updateExpense(id, payload)}
          aiImageBusyId={aiImageBusyId}
          editBusyId={editBusyId}
        />
      </SectionCard>

      <SectionCard title="Rückzahlungen" tone="teal" icon={ArrowLeftRight}>
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
