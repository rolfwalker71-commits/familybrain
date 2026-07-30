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

type FamilyMember = {
  id: number;
  display_name: string;
  aliases: string[];
  gender: "male" | "female" | null;
  avatar_url: string | null;
  user_id: number | null;
  sort_key: number;
  active: number;
};

export function SettingsFamilyPanel() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editAliasesText, setEditAliasesText] = useState("");
  const [editGender, setEditGender] = useState<"male" | "female" | "">("");
  const [editActive, setEditActive] = useState(true);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [avatarTargetId, setAvatarTargetId] = useState<number | null>(null);

  function parseAliasesInput(raw: string): string[] {
    return raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/family");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Familie laden fehlgeschlagen");
      setMembers(data.members || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createMember() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          aliases: parseAliasesInput(aliasesText),
          gender: gender || null,
          generateAvatar: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen");
      setDisplayName("");
      setAliasesText("");
      setGender("");
      setStatus(
        data.member?.avatar_url
          ? "Familienmitglied angelegt (Avatar erzeugt)."
          : "Familienmitglied angelegt."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(m: FamilyMember) {
    setEditId(m.id);
    setEditDisplayName(m.display_name);
    setEditAliasesText(m.aliases.join(", "));
    setEditGender(m.gender || "");
    setEditActive(m.active === 1);
  }

  async function saveEdit() {
    if (editId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName,
          aliases: parseAliasesInput(editAliasesText),
          gender: editGender || null,
          active: editActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setEditId(null);
      setStatus("Familienmitglied gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateAvatar(memberId: number, g?: "male" | "female" | null) {
    setAvatarBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${memberId}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generate: true,
          ...(g !== undefined ? { gender: g } : {}),
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

  async function uploadAvatar(memberId: number, file: File) {
    setAvatarBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/family/${memberId}/avatar`, {
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

  async function removeMember(m: FamilyMember) {
    if (
      !window.confirm(
        `Familienmitglied «${m.display_name}» wirklich löschen?`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/family/${m.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      if (editId === m.id) setEditId(null);
      setStatus("Familienmitglied gelöscht.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={Users} tone="teal" size="sm" />
            Familienmitglied anlegen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Zentrale Liste für Beleg-Empfänger (z. B. Rolf, Valentyna, Dariusch).
            Aliase helfen der Erkennung im OCR («Rolf Walker»). Avatare können
            später in Filtern und am Beleg erscheinen.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="z. B. Rolf"
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
                  __none__: "Ohne Angabe",
                  female: "Weiblich",
                  male: "Männlich",
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ohne Angabe</SelectItem>
                  <SelectItem value="female">Weiblich</SelectItem>
                  <SelectItem value="male">Männlich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Aliase (Komma getrennt)</Label>
              <Input
                value={aliasesText}
                onChange={(e) => setAliasesText(e.target.value)}
                placeholder="z. B. Rolf Walker, R. Walker"
              />
            </div>
          </div>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || !displayName.trim()}
            onClick={() => void createMember()}
          >
            <Plus className="size-4" />
            Anlegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={Users} tone="teal" size="sm" />
            Familie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          {status ? (
            <p className="text-sm text-muted-foreground">{status}</p>
          ) : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Familienmitglieder.
            </p>
          ) : (
            <ul className="space-y-3">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-border/60 p-3"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <UserAvatar
                      name={m.display_name}
                      src={m.avatar_url}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.display_name}</span>
                        {m.active !== 1 ? (
                          <Badge variant="outline">inaktiv</Badge>
                        ) : null}
                        {m.gender === "male" ? (
                          <Badge variant="outline">männlich</Badge>
                        ) : null}
                        {m.gender === "female" ? (
                          <Badge variant="outline">weiblich</Badge>
                        ) : null}
                      </div>
                      {m.aliases.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Aliase: {m.aliases.join(" · ")}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Keine Aliase
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={avatarBusy}
                          onClick={() => void generateAvatar(m.id, m.gender)}
                        >
                          <Sparkles className="size-3.5" />
                          {avatarBusy ? "…" : "KI-Avatar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={avatarBusy}
                          onClick={() => {
                            setAvatarTargetId(m.id);
                            avatarFileRef.current?.click();
                          }}
                        >
                          <ImagePlus className="size-3.5" />
                          Upload
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => startEdit(m)}
                        >
                          <Pencil className="size-3.5" />
                          Bearbeiten
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void removeMember(m)}
                        >
                          <Trash2 className="size-3.5" />
                          Löschen
                        </Button>
                      </div>
                    </div>
                  </div>

                  {editId === m.id ? (
                    <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Name</Label>
                          <Input
                            value={editDisplayName}
                            onChange={(e) =>
                              setEditDisplayName(e.target.value)
                            }
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
                              __none__: "Ohne Angabe",
                              female: "Weiblich",
                              male: "Männlich",
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Optional" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                Ohne Angabe
                              </SelectItem>
                              <SelectItem value="female">Weiblich</SelectItem>
                              <SelectItem value="male">Männlich</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Aliase</Label>
                          <Input
                            value={editAliasesText}
                            onChange={(e) =>
                              setEditAliasesText(e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--brand-docs)]"
                          checked={editActive}
                          onChange={(e) => setEditActive(e.target.checked)}
                        />
                        Aktiv (für Empfänger-Erkennung)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busy || !editDisplayName.trim()}
                          onClick={() => void saveEdit()}
                        >
                          Speichern
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setEditId(null)}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              const id = avatarTargetId;
              e.target.value = "";
              setAvatarTargetId(null);
              if (file && id != null) void uploadAvatar(id, file);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
