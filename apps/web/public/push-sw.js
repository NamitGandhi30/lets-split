// Lock screen notifications. Loaded into the Workbox service worker with importScripts.
// The server sends JSON: { title, body, url, tag? }.

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : "" };
  }
  const title = msg.title || "Let's Split";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: msg.body || "",
      tag: msg.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: msg.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        // The app listens for this and routes without a full reload.
        win.postMessage({ type: "open-url", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
// If iOS rotates the subscription, the app saves the new one the next time it opens (lib/push.ts).
