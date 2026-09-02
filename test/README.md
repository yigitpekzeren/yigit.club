# Push testi — ne işe yaradı, neyi saklıyoruz

Bu klasör sitenin bir parçası değil. Tek bir soruyu cevaplamak için kuruldu:

> GitHub Actions'ta çalışan bir iş, uygulama tamamen kapalıyken iPhone'un
> kilit ekranına web push bildirimi düşürebiliyor mu?

**Cevap: evet.** 2026-09-03'te doğrulandı (workflow koşusu #3). Yani tez yazma
alışkanlığı uygulamasının günlük hatırlatıcısı için ayrı bir sunucuya gerek yok;
GitHub Actions + VAPID yetiyor.

## Bu klasörü ne zaman silmeli

**Asıl uygulama ilk başarılı push'unu gönderene kadar durmalı.**

Sebep: asıl uygulamada push ilk denemede çalışmayacak, bu neredeyse garanti.
O anda elinde çalıştığı doğrulanmış bir referans olması saatler kazandırır.
Test sayfasına bildirim hâlâ düşüyorsa sorun senin yeni kodunda; düşmüyorsa
sorun iOS / izin / anahtar tarafında. Bu ayrımı yapamazsan yanlış yerde ararsın.

İlk başarılı push'tan sonra: `test/`, `send_push.py` ve
`.github/workflows/bildirim.yml` birlikte silinebilir.

## Neyi taşıyacağız

Kodun içinde iki etiket var, `grep` ile bulabilirsin:

```bash
grep -rn "TASINIR" test/ send_push.py
```

- `[TASINIR]` — asıl uygulamada da aynen gerekli
- `[ISKELE]` — yalnızca bu test için, taşınmayacak

| Parça | Durum |
|---|---|
| `test/sw.js` | **Tamamı taşınır.** Teste özel hiçbir şey yok, `/test/` yollarını değiştirmen yeter. |
| `isStandalone()` | Taşınır. iOS'ta push'un ön şartı; bunu kontrol etmezsen sessiz hatayla uğraşırsın. |
| `urlBase64ToUint8Array()` | Taşınır. Standart parça, her web push uygulamasında aynısı. |
| Service worker kaydı + `getSubscription()` | Taşınır. |
| İzin iste → `pushManager.subscribe()` | **Çekirdek.** Asıl uygulamanın kalbi bu. |
| `unsubscribe()` | Taşınır. VAPID anahtarı değişince gerekir. |
| `parse_subscription()` | Taşınır. Erken ve anlaşılır patlamak iyidir. |
| `webpush()` çağrısı | **Çekirdek.** Bire bir aynı. |
| HTTP kodu → anlamı eşlemesi | Taşınır. Üretimde en kritiği `410`. |
| Durum tablosu (`refresh`) | Kodu taşınmaz ama **fikri taşınır** — aşağıya bak. |
| `log()`, kopyala düğmesi, JSON kutusu | Taşınmaz. |
| `annotate()`, `surum_bilgisi()` | Taşınmaz. Teşhis için eklendi. |

### Durum göstergesi fikri neden taşınmalı

iOS'ta web push en az beş ayrı şekilde **sessizce** çalışmaz: sayfa ana ekrana
eklenmemiştir, izin verilmemiştir, service worker kaydolmamıştır, abonelik
ölmüştür, uygulama Safari sekmesinde açılmıştır. Hiçbirinde hata mesajı almazsın.

Asıl uygulamada da küçük bir "bildirimler çalışıyor mu" göstergesi bırak.
Aylarca yanlış şeyi aramanı engeller.

## Asıl uygulamaya geçmeden önce iki karar

### 1. Yeni VAPID anahtar çifti üret

Bu çift test için üretildi ve özel anahtar düz metin olarak paylaşıldı.

Asıl sebep pratik: **public anahtarı değiştirdiğin an mevcut tüm abonelikler
geçersiz olur.** Şu an tek aboneliğin var, yenilemesi otuz saniye. Altı ay
sonra birkaç cihazın varken yapmak istemezsin. Değiştireceksen en ucuz an şimdi.

### 2. Abonelikler nerede duracak

Şu an abonelik bir GitHub secret'ında. Bu **tam olarak bir cihaz** için çalışır
ve abonelik her yenilendiğinde secret'ı elle güncellemen gerekir.

`send_push.py`'yi baştan yazdıracak olan şey push kodu değil, bu soru. Uygulamaya
başlamadan önce cevapla — kod bunun etrafında şekilleniyor.

## Sitenin geri kalanına etkisi

Bilerek yapılmayan şeyler var, böyle kalmalı:

- **Service worker'ın `fetch` dinleyicisi yok.** Hiçbir ağ isteğini kesmiyor.
- **Cache API kullanmıyor.** Hiçbir şey önbelleğe alınmıyor, dolayısıyla
  sitenin başka bir sayfası bayat içerik gösteremez.
- **Kapsamı `/test/`.** Yalnızca bu klasördeki sayfaları kontrol eder.
- Ana sitede başka service worker yok, çakışma da yok.
- Sitenin hiçbir dosyası bu klasöre referans vermiyor; `/test/` ziyaret
  edilmedikçe tek bayt yüklenmiyor.
- Sayfa `noindex` işaretli ve `sitemap.xml` içinde değil.

`index.html` içindeki VAPID **public** anahtarı herkese açık olmalıdır, tasarım
böyle. Özel anahtar depoda hiç bulunmadı (git geçmişinde de yok), yalnızca
repo secret'ı olarak okunuyor.
