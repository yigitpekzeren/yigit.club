<?xml version="1.0" encoding="UTF-8"?>
<!--
  RSS beslemesi tarayıcıda açıldığında ham XML yerine okunabilir bir sayfa
  gösterilsin diye kullanılan görünüm katmanı. RSS okuyucu uygulamaları bu
  bölümü yok sayar; yalnızca insanlar için.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:atom="http://www.w3.org/2005/Atom">

  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/rss">
    <html lang="tr">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title><xsl:value-of select="channel/title"/> · RSS</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
        <script>
          try {
            if (localStorage.getItem("yigitclub_theme") === "light") {
              document.documentElement.dataset.theme = "light";
            }
          } catch (e) {}
        </script>
        <link rel="stylesheet" href="/css/style.css?v=13"/>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,600&amp;display=swap"/>
        <style>
          .feed-adres {
            display: block;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px 14px;
            margin: 16px 0 8px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 13px;
            color: var(--text);
            background-color: var(--surface);
            word-break: break-all;
          }
          .feed-liste { list-style: none; padding-left: 0; }
          .feed-liste li {
            padding: 14px 0;
            border-top: 1px solid var(--border);
          }
          .feed-liste a {
            font-family: var(--font-display);
            font-size: 17px;
            color: var(--text);
            text-decoration: none;
          }
          .feed-liste a:hover { text-decoration: underline; }
          .feed-tarih { display: block; font-size: 12px; color: var(--muted-2); margin-top: 4px; font-style: italic; }
        </style>
      </head>
      <body>
        <header>
          <a href="/index.html" class="logo">
            <span class="logo-bold">yigit.</span><span class="logo-italic">club</span>
          </a>
        </header>

        <article class="sayfa">
          <h1 class="post-baslik">RSS beslemesi</h1>
          <div class="icerik">
            <p>
              Bu sayfa bir <strong>RSS beslemesi</strong>. Yeni yazıları takip etmek
              istersen aşağıdaki adresi bir okuyucu uygulamasına ekleyebilirsin —
              üye olman ya da e-posta vermen gerekmez.
            </p>

            <code class="feed-adres"><xsl:value-of select="channel/atom:link/@href"/></code>
            <p class="hint">Adresi kopyalayıp okuyucuna yapıştır (Feedly, Reeder, NetNewsWire, Inoreader…).</p>

            <h2>Son yazılar</h2>
            <ul class="feed-liste">
              <xsl:for-each select="channel/item">
                <li>
                  <a href="{link}"><xsl:value-of select="title"/></a>
                  <span class="feed-tarih"><xsl:value-of select="substring(pubDate, 1, 16)"/></span>
                </li>
              </xsl:for-each>
            </ul>

            <p><a href="/index.html">← Siteye dön</a></p>
          </div>
        </article>

        <footer>
          <p>yigit.club · <a href="/hakkinda.html">hakkında</a></p>
        </footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
