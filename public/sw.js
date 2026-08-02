/* Buddy service worker — notification click routing + future web push hook. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

self.addEventListener("push", (event) => {
  let title = "Buddy";
  let body = "Neue Benachrichtigung";
  let url = "/dashboard";
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      if (typeof data.title === "string") title = data.title;
      if (typeof data.body === "string") body = data.body;
      if (typeof data.url === "string") url = data.url;
    } else if (event.data) {
      body = event.data.text();
    }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});
