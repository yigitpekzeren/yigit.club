// Bildirim testi için minimum service worker.
// iOS'ta bildirim gösterebilmek için bir service worker kayıtlı olmak zorunda.

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// Bildirime tıklanınca uygulamayı öne getir.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

// Gerçek bir push sunucusu bağlandığında bu kısım çalışacak.
// Şimdilik burada duruyor, sunucu olmadan tetiklenmez.
self.addEventListener('push', function (event) {
  var text = 'Teze bakma vakti.';
  if (event.data) {
    try { text = event.data.text(); } catch (e) {}
  }
  event.waitUntil(
    self.registration.showNotification('Bildirim Testi', {
      body: text,
      icon: './icon-180.png',
      badge: './icon-180.png'
    })
  );
});
