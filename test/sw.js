/* Push testi service worker.
   Tek isi: sunucudan gelen push olayini yakalayip bildirim gostermek. */

const SW_VERSION = "push-testi-1";

self.addEventListener("install", (event) => {
  // Yeni surumu bekletmeden devreye al.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* Push olayi.
   Gonderilen veri JSON ise alanlarini kullaniriz, degilse duz metin sayariz,
   veri hic yoksa da sabit bir baslikla yine de bildirim gosteririz.
   userVisibleOnly:true ile abone olundugu icin her push'ta bildirim
   gostermek zorunludur; aksi halde tarayici aboneligi dusurur. */
self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (err) {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || "Push Testi";
  const options = {
    body: payload.body || "Sunucudan bildirim geldi.",
    icon: payload.icon || "/test/icon-180.png",
    badge: payload.badge || "/test/icon-180.png",
    tag: payload.tag || "push-testi",
    renotify: true,
    requireInteraction: false,
    data: {
      url: payload.url || "/test/",
      sentAt: payload.sentAt || null,
      swVersion: SW_VERSION
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Bildirime dokununca uygulamayi one getir ya da ac. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/test/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.indexOf("/test/") !== -1 && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
  );
});
