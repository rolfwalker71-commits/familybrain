/* Buddy service worker — web push + notification click routing. */
/* rev: 20260802-push-media */
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

function absoluteFromSw(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) {
    try {
      return new URL(url, self.registration.scope).href;
    } catch {
      return url;
    }
  }
  return null;
}

self.addEventListener("push", (event) => {
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

  const options = {
    body,
    data: { url },
    icon: absoluteFromSw(icon) || "/icon-512.png",
    badge: absoluteFromSw(badge) || "/icon-192.png",
  };
  const imageAbs = absoluteFromSw(image);
  if (imageAbs) {
    options.image = imageAbs;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});
