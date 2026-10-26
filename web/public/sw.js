// Service worker: phone alerts (push) and the offline stub.
// Offline: Network-first for pages and API,
// falling back to cache (explicitly saved forecasts + recently visited pages).
const CACHE = "saltsupply-offline-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/offline"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => { if (req.mode === "navigate") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/offline") : Response.error())))
  );
});

// Phone alerts. The payload is lib/push.ts pushMessage: { title, body, url, tag }.
self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "SaltSupply", { body: m.body || "", tag: m.tag, data: { url: m.url || "/" }, icon: "/icons/icon-192.png", badge: "/icons/favicon-32.png" }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const open = cs.find((c) => c.url === url);
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
