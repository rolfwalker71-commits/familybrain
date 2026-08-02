/* Buddy service worker — web push + notification click routing. */
/* rev: 20260802-push-media-v3-android */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* Required by Chromium for a “proper” SW; keep network default. */
self.addEventListener("fetch", () => {
  /* no-op — online-only app */
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification?.data?.url || event.notification?.data?.href;
  const target =
    typeof raw === "string" && raw.startsWith("/")
      ? raw
      : typeof raw === "string" && /^https?:\/\//i.test(raw)
        ? raw
        : "/dashboard";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(target);
              return;
            } catch {
              /* open below */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});

function scopeOrigin() {
  try {
    return new URL(self.registration.scope).origin;
  } catch {
    return self.location.origin;
  }
}

/**
 * Resolve media URLs against the PWA install origin.
 * Absolute URLs from a different host are rewritten to same-origin path
 * (fixes Android when APP_PUBLIC_URL ≠ phone host).
 */
function resolveMediaUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  const origin = scopeOrigin();
  if (url.startsWith("/")) {
    return origin + url;
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith("/api/push/media")) {
        return origin + parsed.pathname + parsed.search;
      }
      if (parsed.origin === origin) return parsed.href;
      return parsed.href;
    } catch {
      return url;
    }
  }
  return null;
}

async function urlReachable(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      mode: "cors",
    });
    return res.ok;
  } catch {
    return false;
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let title = "Buddy";
      let body = "Neue Benachrichtigung";
      let url = "/dashboard";
      let icon = "/icon-512.png";
      let badge = "/icon-192.png";
      let image = null;
      try {
        const data = event.data ? event.data.json() : null;
        if (data && typeof data === "object") {
          if (typeof data.title === "string") title = data.title;
          if (typeof data.body === "string") body = data.body;
          if (typeof data.url === "string") url = data.url;
          if (typeof data.icon === "string") icon = data.icon;
          if (typeof data.badge === "string") badge = data.badge;
          if (typeof data.image === "string") image = data.image;
        } else if (event.data) {
          body = event.data.text();
        }
      } catch {
        /* ignore */
      }

      const fallback = resolveMediaUrl("/icon-512.png");
      let iconAbs = resolveMediaUrl(icon) || fallback;
      let imageAbs = resolveMediaUrl(image) || iconAbs;
      const badgeAbs = resolveMediaUrl(badge) || resolveMediaUrl("/icon-192.png");

      // Warm-fetch: if signed AI media fails on device, don't leave Android
      // stuck with a broken URL (falls back to app icon).
      if (iconAbs && iconAbs.includes("/api/push/media")) {
        const ok = await urlReachable(iconAbs);
        if (!ok) {
          iconAbs = fallback;
          imageAbs = fallback;
        }
      }

      const options = {
        body,
        data: { url },
        icon: iconAbs,
        badge: badgeAbs,
        image: imageAbs,
      };

      await self.registration.showNotification(title, options);
    })()
  );
});
