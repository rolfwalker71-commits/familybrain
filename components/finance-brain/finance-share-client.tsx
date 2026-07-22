"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Plus, Receipt, RefreshCw, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/finance-brain/balance-view";
import { PendingReceiptPicker } from "@/components/finance-brain/expense-receipt-controls";
import { COMMON_CURRENCIES } from "@/lib/finance-brain/constants";

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

export function FinanceShareClient({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState("CHF");
  const [expRate, setExpRate] = useState("1");
  const [expDesc, setExpDesc] = useState("");
  const [expDate, setExpDate] = useState("");
  const [expPlace, setExpPlace] = useState("");
  const [expPayer, setExpPayer] = useState<string>("");

  const [setAmount, setSetAmount] = useState("");
  const [setTo, setSetTo] = useState<string>("");
  const [setNote, setSetNote] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [aiImageBusyId, setAiImageBusyId] = useState<number | null>(null);
  const [editBusyId, setEditBusyId] = useState<number | null>(null);
  const aiAttemptedRef = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/share/f/${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json);
      setExpCurrency(json.ledger.base_currency);
      setExpPayer(String(json.member.id));
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

  async function fetchEcbRate() {
    if (!data) return;
    if (expCurrency === data.ledger.base_currency) {
      setExpRate("1");
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRateLoading(false);
    }
  }

  async function addExpense() {
    const amount = Number(expAmount);
    if (!amount) return;
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
            paidByMemberId: expPayer ? Number(expPayer) : undefined,
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
      setExpDate("");
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
        `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}/ai-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place: place ?? undefined }),
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
        `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}`,
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
    if (!amount || !setTo) return;
    try {
      const res = await fetch(
        `/api/share/f/${encodeURIComponent(token)}/settlements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toMemberId: Number(setTo),
            amount,
            currency: data?.ledger.base_currency ?? "CHF",
            note: setNote.trim() || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setSetAmount("");
      setSetNote("");
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
        `/api/share/f/${encodeURIComponent(token)}/settlements/${settlementId}`,
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

  const { member, ledger, members, expenses, settlements, balances, simplifiedDebts } =
    data;
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

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
      <div className="space-y-1 text-center">
        <Badge variant="secondary">FinanzBrain</Badge>
        <h1 className="text-xl font-semibold">{ledger.title}</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als <span className="font-medium">{member.display_name}</span>
        </p>
      </div>

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

      <BalanceView
        balances={balances}
        simplifiedDebts={simplifiedDebts}
        baseCurrency={ledger.base_currency}
        highlightMemberId={member.id}
      />

      <SectionCard title="Ausgabe erfassen" tone="orange" icon={Receipt}>
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
          <Button className="w-full" onClick={() => void addExpense()} disabled={!expAmount}>
            <Plus className="mr-2 size-4" />
            Ausgabe speichern
          </Button>
        </div>
      </SectionCard>

      {others.length > 0 ? (
        <SectionCard title="Rückzahlung" tone="teal" icon={ArrowLeftRight}>
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
              <Label>Betrag ({ledger.base_currency})</Label>
              <Input
                type="number"
                step="0.01"
                value={setAmount}
                onChange={(e) => setSetAmount(e.target.value)}
              />
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
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Ausgaben" tone="green" icon={Receipt}>
        <ExpenseList
          expenses={expenses}
          members={members}
          baseCurrency={ledger.base_currency}
          canEdit
          receiptUploadUrl={(expenseId) =>
            `/api/share/f/${encodeURIComponent(token)}/expenses/${expenseId}/receipt`
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
