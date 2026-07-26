"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Pencil, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconCircle } from "@/components/layout/icon-circle";
import { UserAvatar } from "@/components/users/user-avatar";

type AppUser = {
  id: number;
  username: string;
  email: string;
  display_name: string;
  gender: "male" | "female" | null;
  active: number;
  avatar_url: string | null;
  trip_ids: number[];
  ledger_ids: number[];
};

type TripOption = { id: number; title: string };
type LedgerOption = { id: number; title: string };

export function SettingsUsersPanel() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [ledgers, setLedgers] = useState<LedgerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editGender, setEditGender] = useState<"male" | "female" | "">("");
  const [editTripIds, setEditTripIds] = useState<number[]>([]);
  const [editLedgerIds, setEditLedgerIds] = useState<number[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [usersRes, tripsRes, ledgersRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/trips"),
        fetch("/api/finance-ledgers"),
      ]);
      const usersData = await usersRes.json();
      const tripsData = await tripsRes.json();
      const ledgersData = await ledgersRes.json();
      if (!usersRes.ok) throw new Error(usersData.error || "User laden fehlgeschlagen");
      if (!tripsRes.ok) throw new Error(tripsData.error || "Reisen laden fehlgeschlagen");
      if (!ledgersRes.ok) {
        throw new Error(ledgersData.error || "Abrechnungen laden fehlgeschlagen");
      }
      setUsers(usersData.users || []);
      setTrips(
        (tripsData.trips || []).map((t: TripOption) => ({
          id: t.id,
          title: t.title,
        }))
      );
      setLedgers(
        (ledgersData.ledgers || []).map((l: LedgerOption) => ({
          id: l.id,
          title: l.title,
        }))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser() {
    if (!username.trim() || !email.trim() || !password) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          displayName: displayName.trim() || username.trim(),
          password,
          gender: gender || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen");
      setUsername("");
      setEmail("");
      setDisplayName("");
      setPassword("");
      setGender("");
      setStatus(`Benutzer «${data.user.username}» angelegt.`);
      await load();
      if (data.user?.id) {
        setEditId(data.user.id);
        setEditDisplayName(data.user.display_name || "");
        setEditEmail(data.user.email || "");
        setEditGender(data.user.gender || "");
        setEditTripIds(data.user.trip_ids || []);
        setEditLedgerIds(data.user.ledger_ids || []);
        setEditPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(user: AppUser) {
    setEditId(user.id);
    setEditTripIds(user.trip_ids || []);
    setEditLedgerIds(user.ledger_ids || []);
    setEditPassword("");
    setEditDisplayName(user.display_name);
    setEditEmail(user.email);
    setEditGender(user.gender || "");
    setStatus(null);
  }

  async function saveUserMeta(user: AppUser) {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          email: editEmail.trim() || user.email,
          displayName: editDisplayName.trim() || user.display_name,
          gender: editGender || null,
          active: Boolean(user.active),
          ...(editPassword ? { password: editPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEditPassword("");
      setStatus("Benutzer gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateAvatar(userId: number) {
    setAvatarBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generate: true,
          gender: editGender || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Avatar erzeugen fehlgeschlagen");
      setStatus("KI-Avatar erzeugt.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function uploadAvatar(userId: number, file: File) {
    setAvatarBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/users/${userId}/avatar`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");
      setStatus("Eigenes Avatar-Bild gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveAccess(userId: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${userId}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripIds: editTripIds,
          ledgerIds: editLedgerIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Zugriff speichern fehlgeschlagen");
      setStatus("Zugriffe gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: AppUser) {
    if (!window.confirm(`Benutzer «${user.username}» wirklich löschen?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      if (editId === user.id) setEditId(null);
      setStatus("Benutzer gelöscht.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleId(list: number[], id: number, setter: (v: number[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={Users} tone="teal" size="sm" />
            Benutzer anlegen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Eingeschränkte Logins nur für zugewiesene TravelBuddy-Reisen und
            FinanzBuddy-Abrechnungen. Der Env-Admin bleibt vollberechtigt.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Login-Name</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Anzeigename</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Passwort</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Geschlecht (für KI-Avatar)</Label>
              <Select
                value={gender || "__none__"}
                onValueChange={(v) => {
                  if (v == null || v === "__none__") setGender("");
                  else setGender(v as "male" | "female");
                }}
                items={{
                  __none__: "Nicht angegeben",
                  female: "Frau",
                  male: "Mann",
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nicht angegeben" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nicht angegeben</SelectItem>
                  <SelectItem value="female">Frau</SelectItem>
                  <SelectItem value="male">Mann</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Beim Anlegen wird automatisch ein kleiner KI-Avatar erzeugt (falls
            OpenAI konfiguriert ist). Später jederzeit neu generieren oder
            eigenes Bild hochladen.
          </p>
          <Button
            disabled={busy || !username.trim() || !email.trim() || password.length < 6}
            onClick={() => void createUser()}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            Benutzer anlegen
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Benutzer & Zugriffe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Benutzer.</p>
          ) : (
            users.map((user) => {
              const editing = editId === user.id;
              return (
                <div
                  key={user.id}
                  className="rounded-xl border border-border/60 bg-white p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <UserAvatar
                        name={user.display_name}
                        src={user.avatar_url}
                        size="lg"
                      />
                      <div className="min-w-0">
                      <p className="font-semibold">
                        {user.display_name}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          @{user.username}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant={user.active ? "secondary" : "outline"}>
                          {user.active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                        {user.gender ? (
                          <Badge variant="outline">
                            {user.gender === "female" ? "Frau" : "Mann"}
                          </Badge>
                        ) : null}
                        <Badge variant="outline">
                          {user.trip_ids.length} Reisen
                        </Badge>
                        <Badge variant="outline">
                          {user.ledger_ids.length} Abrechnungen
                        </Badge>
                      </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(user)}
                      >
                        <Pencil className="mr-1 size-3.5" />
                        Bearbeiten
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeUser(user)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {editing ? (
                    <div className="space-y-3 border-t border-border/50 pt-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <UserAvatar
                          name={editDisplayName || user.display_name}
                          src={user.avatar_url}
                          size="lg"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={busy || avatarBusy}
                            onClick={() => void generateAvatar(user.id)}
                          >
                            <Sparkles className="size-3.5" />
                            {avatarBusy
                              ? "…"
                              : user.avatar_url
                                ? "Neu generieren"
                                : "KI-Avatar"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={busy || avatarBusy}
                            onClick={() => avatarFileRef.current?.click()}
                          >
                            <ImagePlus className="size-3.5" />
                            Eigenes Bild
                          </Button>
                          <input
                            ref={avatarFileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) void uploadAvatar(user.id, file);
                            }}
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Anzeigename</Label>
                          <Input
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>E-Mail</Label>
                          <Input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Geschlecht</Label>
                          <Select
                            value={editGender || "__none__"}
                            onValueChange={(v) => {
                              if (v == null || v === "__none__") setEditGender("");
                              else setEditGender(v as "male" | "female");
                            }}
                            items={{
                              __none__: "Nicht angegeben",
                              female: "Frau",
                              male: "Mann",
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                Nicht angegeben
                              </SelectItem>
                              <SelectItem value="female">Frau</SelectItem>
                              <SelectItem value="male">Mann</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Neues Passwort (optional)</Label>
                          <Input
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                        </div>
                        <div className="flex items-end sm:col-span-2">
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void saveUserMeta({
                                ...user,
                                active: user.active ? 1 : 0,
                              })
                            }
                          >
                            Stammdaten speichern
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>TravelBuddy-Reisen</Label>
                          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                            {trips.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Keine Reisen
                              </p>
                            ) : (
                              trips.map((trip) => (
                                <label
                                  key={trip.id}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                                >
                                  <input
                                    type="checkbox"
                                    checked={editTripIds.includes(trip.id)}
                                    onChange={() =>
                                      toggleId(
                                        editTripIds,
                                        trip.id,
                                        setEditTripIds
                                      )
                                    }
                                  />
                                  <span className="truncate">{trip.title}</span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>FinanzBuddy-Abrechnungen</Label>
                          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                            {ledgers.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Keine Abrechnungen
                              </p>
                            ) : (
                              ledgers.map((ledger) => (
                                <label
                                  key={ledger.id}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                                >
                                  <input
                                    type="checkbox"
                                    checked={editLedgerIds.includes(ledger.id)}
                                    onChange={() =>
                                      toggleId(
                                        editLedgerIds,
                                        ledger.id,
                                        setEditLedgerIds
                                      )
                                    }
                                  />
                                  <span className="truncate">{ledger.title}</span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        disabled={busy}
                        onClick={() => void saveAccess(user.id)}
                      >
                        Zugriffe speichern
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
