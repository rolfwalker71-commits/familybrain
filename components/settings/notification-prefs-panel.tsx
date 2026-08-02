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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToBase64Url(buf: ArrayBuffer | null): string | null {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pushSubscriptionPayload(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = sub.toJSON();
  const p256dh =
    json.keys?.p256dh || bufferToBase64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth || bufferToBase64Url(sub.getKey("auth"));
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Push-Subscription unvollständig (Keys fehlen).");
  }
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

function explainPushError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (/secure|https|insecure/i.test(msg) || name === "SecurityError") {
    return "Push braucht HTTPS (oder localhost). Bitte Buddy über die HTTPS-URL öffnen — nicht nur http://IP:Port.";
  }
  if (/push service|AbortError|Registration failed/i.test(msg) || name === "AbortError") {
    return `${msg} — Unter Windows: Chrome/Edge-Benachrichtigungen in den Windows-Einstellungen erlauben; ggf. Buddy als App installieren.`;
  }
  if (/applicationServerKey|InvalidAccessError/i.test(msg)) {
    return "VAPID-Public-Key ungültig — Keys in der Server-.env prüfen und Container neu erstellen.";
  }
  return msg || "Push aktivieren fehlgeschlagen.";
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Dieser Browser unterstützt keinen Service Worker.");
  }
  if (!window.isSecureContext) {
    throw new Error(
      "Kein sicherer Kontext (HTTPS). Buddy unter HTTPS öffnen."
    );
  }
  const existing = await navigator.serviceWorker.getRegistration("/");
  const reg =
    existing ||
    (await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }));
  // Wait until active (Windows can race permission dialog vs SW activate)
  if (!reg.active) {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Service Worker startet nicht. Seite neu laden und erneut versuchen."
              )
            ),
          15000
        )
      ),
    ]);
  }
  return (await navigator.serviceWorker.getRegistration("/")) || reg;
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
        if (typeof window !== "undefined" && !window.isSecureContext) {
          setPushStatus("unsupported");
          setError(
            "Diese Seite läuft nicht über HTTPS — Web Push unter Windows braucht HTTPS (oder localhost)."
          );
          // still check vapid so status text isn't misleading
        }
        const res = await fetch("/api/push/vapid-public-key");
        const data = await res.json().catch(() => ({}));
        const configured = Boolean(data.configured && data.publicKey);
        setPushConfigured(configured);
        if (typeof window !== "undefined" && !window.isSecureContext) {
          setPushStatus("unsupported");
          return;
        }
        if (
          !configured ||
          typeof window === "undefined" ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window)
        ) {
          setPushStatus(configured ? "unsupported" : "off");
          return;
        }
        await ensureServiceWorkerRegistration().catch(() => null);
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
      if (!window.isSecureContext) {
        throw new Error(
          "Kein HTTPS. Unter Windows Buddy über die öffentliche HTTPS-URL öffnen (nicht http://IP:3100)."
        );
      }
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyJson = await keyRes.json();
      if (!keyRes.ok || !keyJson.publicKey) {
        throw new Error(
          keyJson.error ||
            "VAPID nicht konfiguriert — siehe docs/web-push.md"
        );
      }
      const perm = await Notification.requestPermission();
      setDesktopPermission(perm);
      if (perm !== "granted") {
        throw new Error(
          "Benachrichtigungen wurden nicht erlaubt (Browser- oder Windows-Einstellung)."
        );
      }

      // Windows Chromium: permission dialog can race ahead of PushManager.
      await new Promise((r) => setTimeout(r, 250));

      const reg = await ensureServiceWorkerRegistration();
      if (!reg.pushManager) {
        throw new Error("PushManager fehlt in diesem Browser.");
      }

      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        try {
          await existing.unsubscribe();
        } catch {
          /* recreate below */
        }
      }

      const applicationServerKey = urlBase64ToUint8Array(
        String(keyJson.publicKey).trim()
      );
      // Copy into a fresh ArrayBuffer-backed view (Chromium on Windows is picky).
      const keyCopy = new Uint8Array(applicationServerKey);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyCopy,
      });
      const payload = pushSubscriptionPayload(sub);
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? `${body.error} (HTTP ${res.status})`
            : `Subscribe fehlgeschlagen (HTTP ${res.status})`
        );
      }
      const confirmed = await reg.pushManager.getSubscription();
      if (!confirmed) {
        throw new Error(
          "Subscription wurde vom Browser verworfen. Windows-Benachrichtigungen für Chrome/Edge prüfen."
        );
      }
      setPushStatus("on");
      setPrefs((p) => ({ ...p, desktopEnabled: true }));
      setMessage("Push aktiv — auch bei geschlossener App.");
    } catch (err) {
      setPushStatus("off");
      setError(explainPushError(err));
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
        (VAPID) auch bei geschlossener App — z. B. neuer TravelBuddy-Kommentar.
        Events unten filtern. Pro Benutzer speicherbar.
      </p>

      <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
        <p className="text-sm font-medium text-foreground">Web Push</p>
        <p className="text-xs text-muted-foreground">
          Status:{" "}
          {!pushConfigured
            ? "Server ohne VAPID (Keys in .env setzen)"
            : pushStatus === "on"
              ? "aktiv"
              : pushStatus === "unsupported"
                ? window.isSecureContext === false
                  ? "braucht HTTPS"
                  : "Browser unterstützt Push nicht"
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
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
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
