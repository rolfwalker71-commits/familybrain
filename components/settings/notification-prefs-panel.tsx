"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NotifyReason } from "@/lib/realtime/hub";
import {
  desktopNotificationsSupported,
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
} from "@/lib/realtime/desktop-notify";
import {
  mergeNotificationPrefs,
  type UserNotificationPrefs,
} from "@/lib/realtime/prefs-client";

type CatalogItem = {
  reason: NotifyReason;
  label: string;
  domain: "documents" | "travel" | "finance";
};

type ScopeItem = { id: number; title: string };

const DOMAIN_LABEL: Record<string, string> = {
  documents: "Dokumente",
  travel: "TravelBuddy",
  finance: "FinanzBuddy",
};

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<UserNotificationPrefs>(() =>
    mergeNotificationPrefs(null)
  );
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [trips, setTrips] = useState<ScopeItem[]>([]);
  const [ledgers, setLedgers] = useState<ScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desktopPermission, setDesktopPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    "unknown" | "unsupported" | "off" | "on" | "busy"
  >("unknown");

  useEffect(() => {
    setDesktopPermission(getDesktopNotificationPermission());
    void (async () => {
      try {
        const res = await fetch("/api/me/notification-prefs");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
        setPrefs(mergeNotificationPrefs(data.prefs));
        setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
        setTrips(Array.isArray(data.trips) ? data.trips : []);
        setLedgers(Array.isArray(data.ledgers) ? data.ledgers : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
    void (async () => {
      try {
        const res = await fetch("/api/push/vapid-public-key");
        const data = await res.json().catch(() => ({}));
        const configured = Boolean(data.configured && data.publicKey);
        setPushConfigured(configured);
        if (
          !configured ||
          typeof window === "undefined" ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window)
        ) {
          setPushStatus(configured ? "unsupported" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushStatus(sub ? "on" : "off");
      } catch {
        setPushStatus("off");
      }
    })();
  }, []);

  const byDomain = useMemo(() => {
    const map: Record<string, CatalogItem[]> = {
      documents: [],
      travel: [],
      finance: [],
    };
    for (const item of catalog) {
      (map[item.domain] ||= []).push(item);
    }
    return map;
  }, [catalog]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/me/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setPrefs(mergeNotificationPrefs(data.prefs));
      setMessage("Benachrichtigungs-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function toggleEvent(reason: NotifyReason, on: boolean) {
    setPrefs((prev) => ({
      ...prev,
      events: { ...prev.events, [reason]: on },
    }));
  }

  function toggleScopeId(
    key: "tripIds" | "ledgerIds",
    id: number,
    on: boolean
  ) {
    setPrefs((prev) => {
      const current = prev[key];
      // null = all selected; switching to explicit list starts from all then removes
      let next: number[];
      if (current == null) {
        const all = (key === "tripIds" ? trips : ledgers).map((x) => x.id);
        next = on ? all : all.filter((x) => x !== id);
      } else {
        next = on
          ? [...new Set([...current, id])]
          : current.filter((x) => x !== id);
      }
      const full = (key === "tripIds" ? trips : ledgers).map((x) => x.id);
      const isAll =
        full.length > 0 &&
        full.every((x) => next.includes(x)) &&
        next.length === full.length;
      return { ...prev, [key]: isAll || next.length === 0 ? null : next };
    });
  }

  async function enableWebPush() {
    setPushStatus("busy");
    setError(null);
    setMessage(null);
    try {
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyJson = await keyRes.json();
      if (!keyRes.ok || !keyJson.publicKey) {
        throw new Error(
          keyJson.error ||
            "VAPID nicht konfiguriert. Auf dem Server Keys erzeugen (npm run push:vapid)."
        );
      }
      const perm = await Notification.requestPermission();
      setDesktopPermission(perm);
      if (perm !== "granted") {
        throw new Error("Benachrichtigungen wurden nicht erlaubt.");
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey as string),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Subscribe fehlgeschlagen");
      setPushStatus("on");
      setPrefs((p) => ({ ...p, desktopEnabled: true }));
      setMessage("Push aktiv — auch bei geschlossener App (PWA/TWA).");
    } catch (err) {
      setPushStatus("off");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function disableWebPush() {
    setPushStatus("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushStatus("off");
      setMessage("Push deaktiviert.");
    } catch (err) {
      setPushStatus("off");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Lade Einstellungen…</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Live-Toasts bei offenem Tab; Desktop-Toasts im Hintergrund-Tab; Web Push
        auch bei geschlossener PWA/TWA (z. B. neuer TravelBuddy-Kommentar). Pro
        Benutzer speicherbar — Event «Neuer Reise-Kommentar» unten aktiv lassen.
      </p>

      <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
        <p className="text-sm font-medium text-foreground">Web Push (Handy/PWA)</p>
        <p className="text-xs text-muted-foreground">
          Status:{" "}
          {!pushConfigured
            ? "Server ohne VAPID (Keys setzen)"
            : pushStatus === "on"
              ? "aktiv"
              : pushStatus === "unsupported"
                ? "Browser unterstützt Push nicht"
                : pushStatus === "busy"
                  ? "…"
                  : "aus"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !prefs.enabled ||
              !pushConfigured ||
              pushStatus === "busy" ||
              pushStatus === "on" ||
              pushStatus === "unsupported"
            }
            onClick={() => void enableWebPush()}
          >
            Push aktivieren
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pushStatus !== "on"}
            onClick={() => void disableWebPush()}
          >
            Push aus
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
        <input
          id="notifEnabled"
          type="checkbox"
          className="mt-1 size-4 accent-[var(--brand-docs)]"
          checked={prefs.enabled}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, enabled: e.target.checked }))
          }
        />
        <div className="min-w-0 space-y-1">
          <Label htmlFor="notifEnabled" className="cursor-pointer">
            Live-Benachrichtigungen
          </Label>
          <p className="text-xs text-muted-foreground">
            Toasts bei Dokument-, Reise- und Finanz-Ereignissen.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
        <input
          id="notifSound"
          type="checkbox"
          className="mt-1 size-4 accent-[var(--brand-docs)]"
          checked={prefs.soundEnabled}
          disabled={!prefs.enabled}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, soundEnabled: e.target.checked }))
          }
        />
        <div className="min-w-0 space-y-1">
          <Label htmlFor="notifSound" className="cursor-pointer">
            Ton («Bling»)
          </Label>
          <p className="text-xs text-muted-foreground">
            Kurzer Hinweis-Ton beim Aufpoppen (Browser kann Autoplay blocken).
          </p>
        </div>
      </div>

      {desktopNotificationsSupported() ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
          <div className="flex items-start gap-3">
            <input
              id="notifDesktop"
              type="checkbox"
              className="mt-1 size-4 accent-[var(--brand-docs)]"
              checked={prefs.desktopEnabled}
              disabled={!prefs.enabled || desktopPermission === "denied"}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, desktopEnabled: e.target.checked }))
              }
            />
            <div className="min-w-0 space-y-1">
              <Label htmlFor="notifDesktop" className="cursor-pointer">
                Desktop-Benachrichtigungen (Windows)
              </Label>
              <p className="text-xs text-muted-foreground">
                Windows-/Browser-Toast, wenn Buddy im Hintergrund-Tab läuft.
                Der Tab muss geöffnet bleiben (nicht komplett schliessen).
              </p>
              <p className="text-xs text-muted-foreground">
                Browser-Erlaubnis:{" "}
                <strong>
                  {desktopPermission === "granted"
                    ? "erteilt"
                    : desktopPermission === "denied"
                      ? "blockiert — in den Browser-Einstellungen für diese Seite erlauben"
                      : "noch nicht erteilt"}
                </strong>
              </p>
            </div>
          </div>
          {desktopPermission !== "granted" && desktopPermission !== "denied" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!prefs.enabled || saving}
              onClick={() => {
                void (async () => {
                  const perm = await requestDesktopNotificationPermission();
                  setDesktopPermission(perm);
                  if (perm === "granted") {
                    setPrefs((p) => ({ ...p, desktopEnabled: true }));
                    setMessage(
                      "Desktop-Benachrichtigungen erlaubt. Speichern nicht vergessen."
                    );
                  } else if (perm === "denied") {
                    setError(
                      "Desktop-Benachrichtigungen wurden vom Browser blockiert."
                    );
                  }
                })();
              }}
            >
              Desktop-Benachrichtigungen erlauben
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Dieser Browser unterstützt keine Desktop-Benachrichtigungen.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="notifDuration" className="text-xs text-muted-foreground">
          Anzeigedauer
        </Label>
        <Input
          id="notifDuration"
          type="number"
          min={3}
          max={60}
          disabled={!prefs.enabled}
          className="h-8 w-20 rounded-lg text-sm"
          value={prefs.durationSec}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (!Number.isFinite(n)) return;
            setPrefs((p) => ({ ...p, durationSec: n }));
          }}
        />
        <span className="text-xs text-muted-foreground">Sekunden (3–60)</span>
      </div>

      {(["documents", "travel", "finance"] as const).map((domain) => (
        <div
          key={domain}
          className="space-y-2 rounded-xl border border-border/60 p-3"
        >
          <p className="text-sm font-medium">{DOMAIN_LABEL[domain]}</p>
          <div className="space-y-2">
            {(byDomain[domain] || []).map((item) => (
              <label
                key={item.reason}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--brand-docs)]"
                  disabled={!prefs.enabled}
                  checked={prefs.events[item.reason] !== false}
                  onChange={(e) => toggleEvent(item.reason, e.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      ))}

      {trips.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-border/60 p-3">
          <p className="text-sm font-medium">Nur diese Reisen</p>
          <p className="text-xs text-muted-foreground">
            Alle an = keine Einschränkung. Sonst nur gewählte Reisen.
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {trips.map((t) => {
              const checked =
                prefs.tripIds == null || prefs.tripIds.includes(t.id);
              return (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand-docs)]"
                    disabled={!prefs.enabled}
                    checked={checked}
                    onChange={(e) =>
                      toggleScopeId("tripIds", t.id, e.target.checked)
                    }
                  />
                  <span className="truncate">{t.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {ledgers.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-border/60 p-3">
          <p className="text-sm font-medium">Nur diese Abrechnungen</p>
          <p className="text-xs text-muted-foreground">
            Alle an = keine Einschränkung.
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {ledgers.map((l) => {
              const checked =
                prefs.ledgerIds == null || prefs.ledgerIds.includes(l.id);
              return (
                <label
                  key={l.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand-docs)]"
                    disabled={!prefs.enabled}
                    checked={checked}
                    onChange={(e) =>
                      toggleScopeId("ledgerIds", l.id, e.target.checked)
                    }
                  />
                  <span className="truncate">{l.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}

      <Button disabled={saving} onClick={() => void save()}>
        {saving ? "Speichern…" : "Benachrichtigungen speichern"}
      </Button>
    </div>
  );
}
