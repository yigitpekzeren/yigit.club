/* Push testi service worker.
   Tek isi: sunucudan gelen push olayini yakalayip bildirim gostermek.

   [TASINIR] BU DOSYANIN TAMAMI asil uygulamaya oldugu gibi tasinabilir.
   Icinde teste ozel hicbir sey yok; yalnizca "/test/" yollarini kendi
   uygulama yolunla degistir.

   Bilerek yapilmayan iki sey var, boyle kalmali:
   - fetch dinleyicisi YOK  -> hicbir ag istegini kesmiyor
   - Cache API kullanimi YOK -> hicbir sey onbellege alinmiyor
   Bu ikisi sayesinde service worker sitenin geri kalanina dokunmuyor. */

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

/* Bildirim yukundeki url'i kendi originimizle sinirlar.
   Bu yuku ancak ozel VAPID anahtarina sahip biri gonderebilir, yani
   pratikte yalnizca biz. Yine de disari acilan bir kapi birakmiyoruz:
   beklenmedik bir url gelirse uygulamanin kendi sayfasina duseriz. */
function guvenliUrl(ham) {
  try {
    const u = new URL(ham || "/test/", self.location.origin);
    return u.origin === self.location.origin ? u.href : "/test/";
  } catch (err) {
    return "/test/";
  }
}

/* Bildirime dokununca uygulamayi one getir ya da ac. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = guvenliUrl(event.notification.data && event.notification.data.url);

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
