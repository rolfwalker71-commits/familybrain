"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
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
  const [expPayer, setExpPayer] = useState<string>("");

  const [setAmount, setSetAmount] = useState("");
  const [setTo, setSetTo] = useState<string>("");
  const [setNote, setSetNote] = useState("");

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
            paidByMemberId: expPayer ? Number(expPayer) : undefined,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setExpAmount("");
      setExpDesc("");
      setExpDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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

      <SectionCard title="Ausgabe erfassen">
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
              <Label>Kurs</Label>
              <Input
                type="number"
                step="0.0001"
                value={expRate}
                onChange={(e) => setExpRate(e.target.value)}
              />
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
            <Label>Datum</Label>
            <Input
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
            />
          </div>
          <Button className="w-full" onClick={() => void addExpense()} disabled={!expAmount}>
            <Plus className="mr-2 size-4" />
            Ausgabe speichern
          </Button>
        </div>
      </SectionCard>

      {others.length > 0 ? (
        <SectionCard title="Rückzahlung">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>An</Label>
              <Select
                value={setTo}
                onValueChange={(v) => {
                  if (v == null) return;
                  setSetTo(v);
                }}
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

      <SectionCard title="Ausgaben">
        <ExpenseList
          expenses={expenses}
          members={members}
          baseCurrency={ledger.base_currency}
        />
      </SectionCard>

      <SectionCard title="Rückzahlungen">
        <SettlementList
          settlements={settlements}
          members={members}
          baseCurrency={ledger.base_currency}
        />
      </SectionCard>
    </div>
  );
}
