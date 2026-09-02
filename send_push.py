#!/usr/bin/env python3
"""GitHub Actions'tan iPhone'a web push bildirimi gonderir.

Tek amaci: uygulama tamamen kapaliyken sunucudan gelen bildirimin
kilit ekranina dusup dusmedigini olcmek.

Gerekli ortam degiskenleri:
  VAPID_PRIVATE_KEY  base64url kodlu ozel VAPID anahtari (repo secret)
  VAPID_SUBJECT      "mailto:..." ya da "https://..." ile baslayan iletisim adresi
  PUSH_SUBSCRIPTION  telefonda uretilen subscription JSON'u (repo secret)

Istege bagli:
  PUSH_TITLE / PUSH_BODY  bildirim basligi ve metni
"""

import json
import os
import sys
import traceback
from datetime import datetime, timedelta, timezone
from importlib.metadata import PackageNotFoundError, version

try:
    from pywebpush import webpush, WebPushException
except ImportError:
    sys.exit(
        "HATA: pywebpush kurulu degil.\n"
        "  Cozum: pip install pywebpush"
    )

# Turkiye saati (UTC+3, yaz saati uygulanmiyor).
TR = timezone(timedelta(hours=3))


def in_actions():
    return os.environ.get("GITHUB_ACTIONS") == "true"


def annotate(kind, title, message):
    """GitHub Actions'ta bir annotation yazar.

    Annotation'lar kosu sayfasinda, log'a girmeden de gorunur; bu yuzden
    hatayi hem log'a hem oraya basiyoruz.
    """
    if not in_actions():
        return
    body = message.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
    print("::{kind} title={title}::{body}".format(kind=kind, title=title, body=body))


def fail(message):
    """Anlasilir bir hata basip cikar."""
    text = message.strip()
    annotate("error", "Push gonderilemedi", text)
    print("\n" + "=" * 60)
    print("HATA")
    print("=" * 60)
    print(text)
    print("=" * 60 + "\n")
    sys.exit(1)


def surum_bilgisi():
    """Kurulu paket surumlerini ve secret uzunluklarini ozetler.

    Deger degil yalnizca uzunluk yazilir; secret'lar log'a sizmaz.
    """
    parcalar = []
    for paket in ("pywebpush", "py_vapid", "cryptography", "http_ece"):
        try:
            parcalar.append("{0}={1}".format(paket, version(paket.replace("_", "-"))))
        except PackageNotFoundError:
            parcalar.append("{0}=yok".format(paket))

    for name in ("VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "PUSH_SUBSCRIPTION"):
        deger = (os.environ.get(name) or "").strip()
        parcalar.append("{0}={1} krkt".format(name, len(deger)))

    return "python={0} | {1}".format(
        sys.version.split()[0], " | ".join(parcalar)
    )


def read_env(name):
    """Ortam degiskenini oku; bos ya da eksikse aciklamali hata ver."""
    value = (os.environ.get(name) or "").strip()
    if not value:
        # Sik yapilan hata: deger ayni sayfadaki 'Variables' sekmesine eklenir.
        # Workflow bu ikisini VAR_ onekiyle ayrica okuyor, boylece ayirt edebiliyoruz.
        if (os.environ.get("VAR_" + name) or "").strip():
            fail(
                "{name} 'Secrets' sekmesinde yok, ama 'Variables' sekmesinde duruyor.\n\n"
                "O sayfada yan yana iki sekme var: Secrets ve Variables.\n"
                "Bu deger Secrets sekmesinde olmali.\n\n"
                "Yapilacak: Variables sekmesindeki {name} kaydini sil, sonra\n"
                "Secrets sekmesinde 'New repository secret' ile yeniden ekle.\n\n"
                "Ozellikle VAPID_PRIVATE_KEY icin onemli: Variables sekmesindeki\n"
                "degerler sifrelenmez ve herkese acik depoda gorunur.".format(name=name)
            )

        fail(
            "{name} ortam degiskeni bos ya da tanimli degil.\n\n"
            "GitHub Actions kullaniyorsan: repo > Settings > Secrets and variables\n"
            "> Actions altinda {name} adinda bir secret olmali ve workflow'un\n"
            "env blogunda su satir bulunmali:\n"
            "    {name}: ${{{{ secrets.{name} }}}}".format(name=name)
        )
    return value


def parse_subscription(raw):
    """Subscription JSON'unu dogrula ve sozluk olarak dondur."""
    try:
        sub = json.loads(raw)
    except json.JSONDecodeError as err:
        fail(
            "PUSH_SUBSCRIPTION gecerli bir JSON degil: {err}\n\n"
            "Telefondaki test sayfasinda uretilen JSON'un tamamini,\n"
            "suslu parantezler dahil, oldugu gibi yapistirmalisin.".format(err=err)
        )

    if not isinstance(sub, dict):
        fail("PUSH_SUBSCRIPTION bir JSON nesnesi ({...}) olmali.")

    endpoint = sub.get("endpoint")
    if not endpoint:
        fail("PUSH_SUBSCRIPTION icinde 'endpoint' alani yok. Aboneligi telefonda yeniden olustur.")

    keys = sub.get("keys") or {}
    missing = [k for k in ("p256dh", "auth") if not keys.get(k)]
    if missing:
        fail(
            "PUSH_SUBSCRIPTION icinde keys.{alanlar} eksik.\n"
            "Aboneligi telefonda yeniden olustur ve JSON'un tamamini kopyala.".format(
                alanlar=", keys.".join(missing)
            )
        )

    return sub


def main():
    # Ortam ozetini en basta yaz: bir sey patlarsa neyin kurulu oldugunu
    # ve hangi secret'in bos kaldigini log'a girmeden gorebilelim.
    ortam = surum_bilgisi()
    print(ortam)
    annotate("notice", "Ortam", ortam)
    print()

    private_key = read_env("VAPID_PRIVATE_KEY")
    subject = read_env("VAPID_SUBJECT")
    subscription = parse_subscription(read_env("PUSH_SUBSCRIPTION"))

    if not (subject.startswith("mailto:") or subject.startswith("https://")):
        fail(
            "VAPID_SUBJECT 'mailto:' ya da 'https://' ile baslamali.\n"
            "Su an: {subject}\n"
            "Ornek: mailto:ornek@ornek.com\n\n"
            "Apple'in push sunucusu bu kurala uymayan istekleri reddeder.".format(subject=subject)
        )

    if "-----BEGIN" in private_key:
        fail(
            "VAPID_PRIVATE_KEY bir PEM blogu gibi gorunuyor.\n"
            "Bu test icin anahtar tek satirlik base64url metni olmali."
        )

    now = datetime.now(TR)
    endpoint = subscription["endpoint"]
    host = endpoint.split("/")[2] if "//" in endpoint else endpoint

    payload = {
        "title": os.environ.get("PUSH_TITLE") or "Tez yazma zamani",
        "body": os.environ.get("PUSH_BODY")
        or "Bu bildirim GitHub Actions'tan geldi ({saat}).".format(saat=now.strftime("%H:%M")),
        "url": "/test/",
        "tag": "push-testi",
        "sentAt": now.isoformat(timespec="seconds"),
    }

    print("Gonderiliyor")
    print("  zaman (TR) : {0}".format(now.strftime("%d.%m.%Y %H:%M:%S")))
    print("  hedef      : {0}".format(host))
    print("  subject    : {0}".format(subject))
    print("  baslik     : {0}".format(payload["title"]))
    print("  metin      : {0}".format(payload["body"]))
    print()

    try:
        response = webpush(
            subscription_info=subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
            ttl=86400,
            headers={"Urgency": "high"},
        )
    except WebPushException as err:
        detail = ""
        status = None
        resp = getattr(err, "response", None)
        if resp is not None:
            status = getattr(resp, "status_code", None)
            detail = (getattr(resp, "text", "") or "").strip()

        ipucu = {
            400: "Istek reddedildi. VAPID anahtar cifti ile aboneligin uretildigi\n"
                 "public anahtar ayni mi? index.html'deki public anahtar degistiyse\n"
                 "telefonda aboneligi yeniden olusturman gerekir.",
            401: "Yetkisiz. VAPID_PRIVATE_KEY yanlis ya da VAPID_SUBJECT gecersiz.",
            403: "Yasak. Ozel anahtar, sayfaya gomulu public anahtarla eslesmiyor.",
            404: "Abonelik bulunamadi. Telefonda yeniden abone ol ve\n"
                 "PUSH_SUBSCRIPTION secret'ini guncelle.",
            410: "Abonelik artik gecerli degil (uygulama silinmis ya da izin geri alinmis).\n"
                 "Telefonda yeniden abone ol ve PUSH_SUBSCRIPTION secret'ini guncelle.",
            413: "Yuk cok buyuk. Bildirim metnini kisalt.",
            429: "Cok fazla istek. Bir sure bekleyip tekrar dene.",
        }.get(status, "")

        fail(
            "Push servisi istegi kabul etmedi.\n"
            "  HTTP durumu : {status}\n"
            "  Yanit       : {detail}\n"
            "  Ayrinti     : {err}\n\n{ipucu}".format(
                status=status if status is not None else "yok",
                detail=detail or "(bos)",
                err=err,
                ipucu=ipucu,
            )
        )
    except Exception as err:  # noqa: BLE001 - log icin genis yakalama kasitli
        fail(
            "Beklenmeyen hata: {tur}: {err}\n\n{iz}".format(
                tur=type(err).__name__,
                err=err,
                iz=traceback.format_exc().strip(),
            )
        )

    print("Push servisi kabul etti. HTTP {0}".format(response.status_code))
    print()
    print("Simdi telefonu kontrol et: bildirim kilit ekraninda gorunuyor mu?")
    print("Gorunuyorsa test basarili; uygulama kapaliyken sunucudan bildirim dusuyor.")


if __name__ == "__main__":
    main()
