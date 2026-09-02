const CMS_REPO = "yigitpekzeren/yigit.club";
const CMS_BRANCH = "main";
const DATA_FOLDER = "notlar-data";
const INDEX_FILE = "notlar-data/index.json";
const CATEGORIES_FILE = "kategoriler.json";
const OZET_FILE = "ozet.json";
const THEME_KEY = "yigitclub_theme";

let __notlarCache = null;
let __categoriesCache = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function fetchCategories(fetchPrefix) {
  if (__categoriesCache) return __categoriesCache;
  try {
    const res = await fetch(`${fetchPrefix}${CATEGORIES_FILE}?t=${Date.now()}`);
    __categoriesCache = await res.json();
  } catch (e) {
    __categoriesCache = [];
  }
  return __categoriesCache;
}

function categoryLabel(slug, categories) {
  const found = (categories || []).find((c) => c.slug === slug);
  return found ? found.label : slug || "genel";
}

function kategoriEtiketHTML(post, pathPrefix, categories) {
  const isRealCategory = (categories || []).some((c) => c.slug === post.category);
  const label = escapeHtml(categoryLabel(post.category, categories));
  const catHtml = isRealCategory
    ? `<span class="kart-link" role="link" tabindex="0" data-href="${pathPrefix}kategori/${encodeURIComponent(post.category)}.html">${label}</span>`
    : label;
  if (!post.subcategory) return catHtml;
  const subHtml = `<span class="kart-link" role="link" tabindex="0" data-href="${pathPrefix}alt-kategori.html?alt=${encodeURIComponent(post.subcategory)}">${escapeHtml(post.subcategory)}</span>`;
  return `${catHtml} / ${subHtml}`;
}

document.addEventListener(
  "click",
  (e) => {
    const link = e.target.closest(".kart-link");
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    window.location.href = link.dataset.href;
  },
  true
);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const link = e.target.closest && e.target.closest(".kart-link");
  if (!link) return;
  e.preventDefault();
  window.location.href = link.dataset.href;
});

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });
  if (!iso.includes("T")) return datePart;
  const timePart = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

function formatDateOnly(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });
}

async function renderNav(fetchPrefix, navPrefix) {
  const nav = document.getElementById("site-nav");
  if (!nav) return;
  try {
    const cats = await fetchCategories(fetchPrefix);
    nav.innerHTML =
      cats
        .map((c) => `<a href="${navPrefix}${encodeURIComponent(c.slug)}.html">${escapeHtml(c.label)}</a>`)
        .join("") + `<a href="${fetchPrefix}hakkinda.html" class="nav-hakkinda">hakkında</a>`;
  } catch (e) {
    console.error(e);
  }
}

/* Yazı listesi tek bir manifest dosyasından okunur: kendi alan adımızdan, tek istek.
   Manifest'i admin panel her yayında yeniden üretir. GitHub API'si yalnızca
   manifest yoksa/bozuksa devreye giren güvenlik ağıdır (API limiti: 60 istek/saat/IP). */
async function fetchAllNotlar(fetchPrefix = "") {
  if (__notlarCache) return __notlarCache;

  try {
    const res = await fetch(`${fetchPrefix}${INDEX_FILE}?t=${Date.now()}`);
    if (res.ok) {
      const posts = await res.json();
      if (Array.isArray(posts) && posts.length > 0) {
        posts.sort((a, b) => new Date(b.date) - new Date(a.date));
        __notlarCache = posts;
        return posts;
      }
    }
  } catch (e) {
    /* manifest okunamadı; aşağıdaki API yedeğine düşülür */
  }

  return fetchNotlarFromApi();
}

async function fetchNotlarFromApi() {
  const listUrl = `https://api.github.com/repos/${CMS_REPO}/contents/${DATA_FOLDER}?ref=${CMS_BRANCH}`;
  const listRes = await fetch(listUrl);
  if (!listRes.ok) throw new Error("Yazı listesi alınamadı");
  const files = await listRes.json();
  const jsonFiles = files.filter((f) => f.name.endsWith(".json") && f.name !== "index.json");

  const posts = await Promise.all(
    jsonFiles.map(async (f) => {
      const res = await fetch(`${f.download_url}?t=${Date.now()}`);
      const data = await res.json();
      return { ...data, slug: f.name.replace(/\.json$/, "") };
    })
  );

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  __notlarCache = posts;
  return posts;
}

function kartHTML(post, pathPrefix, buyuk, categories) {
  const etiketHtml = kategoriEtiketHTML(post, pathPrefix, categories);
  const rozet = post.stage || "";
  const href = `${pathPrefix}post.html?slug=${encodeURIComponent(post.slug)}`;

  if (post.category === "fotograf" && post.image) {
    return `
      <a href="${href}" class="kart kart-foto${buyuk ? " buyuk" : ""}" style="background-image:url('${pathPrefix}${escapeHtml(post.image)}')">
        <div class="kart-ust">
          <span class="kart-kategori">${etiketHtml}</span>
          ${rozet ? `<span class="rozet">${escapeHtml(rozet)}</span>` : ""}
        </div>
        <div>
          <div class="kart-baslik">${escapeHtml(post.title)}</div>
          ${post.imageCaption ? `<div class="kart-foto-caption">${escapeHtml(post.imageCaption)}</div>` : ""}
          <div class="kart-tarih">${formatDateOnly(post.date)}</div>
        </div>
      </a>
    `;
  }

  return `
    <a href="${href}" class="kart${buyuk ? " buyuk" : ""}">
      <div class="kart-ust">
        <span class="kart-kategori">${etiketHtml}</span>
        ${rozet ? `<span class="rozet">${escapeHtml(rozet)}</span>` : ""}
      </div>
      <div>
        <div class="kart-baslik">${escapeHtml(post.title)}</div>
        <div class="kart-tarih">${formatDateOnly(post.date)}</div>
      </div>
    </a>
  `;
}

async function renderGrid(containerSelector, { pathPrefix = "" } = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const category = container.dataset.category || null;
  const subcategory = container.dataset.subcategory || null;

  try {
    const [allPosts, categories] = await Promise.all([fetchAllNotlar(pathPrefix), fetchCategories(pathPrefix)]);
    let posts = allPosts;
    if (category) posts = posts.filter((p) => p.category === category);
    if (subcategory) posts = posts.filter((p) => p.subcategory === subcategory);

    if (posts.length === 0) {
      container.innerHTML = '<p style="color:#a1a1aa;">Bu kategoride henüz yazı yok.</p>';
      return;
    }

    container.innerHTML = posts
      .map((p, i) => kartHTML(p, pathPrefix, i === 0 && !category && !subcategory, categories))
      .join("");
  } catch (e) {
    container.innerHTML = '<p style="color:#a1a1aa;">Yazılar yüklenemedi.</p>';
    console.error(e);
  }
}

function entryHTML(entry) {
  const bodyHtml = entry.bodyFormat === "html"
    ? entry.body || ""
    : window.marked ? marked.parse(entry.body || "") : escapeHtml(entry.body || "");
  return `
    <div class="post-entry">
      <div class="icerik">${bodyHtml}</div>
      <div class="post-entry-time">${formatDateTime(entry.date)}</div>
    </div>
  `;
}

/* Sayfa istemcide oluşturulduğu için OG etiketlerini de burada güncelliyoruz.
   Not: WhatsApp/X gibi paylaşım botları JavaScript çalıştırmadığından bunlar
   yalnızca JS çalıştıran araçlara ulaşır; bot önizlemesi site geneli
   etiketlere düşer. Yazı başına gerçek önizleme için her yazının kendi HTML
   dosyasına ihtiyaç var (ayrı bir yapı değişikliği). */
function setPostMeta(post) {
  const duzMetin = (post.entries || [])
    .map((e) =>
      e.bodyFormat === "html"
        ? new DOMParser().parseFromString(e.body || "", "text/html").body.textContent || ""
        : e.body || ""
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const aciklama = post.imageCaption || duzMetin.slice(0, 160);

  const ayarla = (secici, deger) => {
    const el = document.querySelector(secici);
    if (el && deger) el.setAttribute("content", deger);
  };
  ayarla('meta[property="og:title"]', `${post.title} — yigit.club`);
  ayarla('meta[name="description"]', aciklama);
  ayarla('meta[property="og:description"]', aciklama);
  ayarla('meta[property="og:url"]', window.location.href);
  if (post.image) ayarla('meta[property="og:image"]', new URL(post.image, window.location.href).href);
}

async function postNavHTML(currentSlug) {
  let posts;
  try {
    posts = await fetchAllNotlar("");
  } catch (e) {
    return "";
  }
  const i = posts.findIndex((p) => p.slug === currentSlug);
  if (i === -1) return "";

  // Liste yeniden eskiye sıralı: bir önceki eleman daha yeni, sonraki daha eski.
  const dahaYeni = i > 0 ? posts[i - 1] : null;
  const dahaEski = i < posts.length - 1 ? posts[i + 1] : null;

  const kutu = (post, etiket, konum) =>
    post
      ? `<a class="post-nav-link ${konum}" href="post.html?slug=${encodeURIComponent(post.slug)}">
           <span class="post-nav-label">${etiket}</span>
           <span class="post-nav-title">${escapeHtml(post.title)}</span>
         </a>`
      : `<span class="post-nav-link ${konum} bos"></span>`;

  return `
    <nav class="post-nav" aria-label="Yazılar arasında gezinme">
      ${kutu(dahaEski, "← Daha eski", "post-nav-onceki")}
      <a class="post-nav-home" href="index.html">Tüm yazılar</a>
      ${kutu(dahaYeni, "Daha yeni →", "post-nav-sonraki")}
    </nav>
  `;
}

async function renderPost(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    container.innerHTML = '<p style="color:#a1a1aa;">Yazı bulunamadı.</p>';
    return;
  }

  try {
    const res = await fetch(`${DATA_FOLDER}/${encodeURIComponent(slug)}.json?t=${Date.now()}`);
    if (!res.ok) throw new Error("Yazı bulunamadı");
    const post = await res.json();

    document.title = `${post.title} | yigit.club`;
    setPostMeta(post);

    const categories = await fetchCategories("");
    const etiketHtml = kategoriEtiketHTML(post, "", categories);
    const navHtml = await postNavHTML(slug);

    const entries = [...(post.entries || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
    const entriesHtml = entries.map(entryHTML).join("");

    const metaHtml = `
      <div class="kart-ust" style="margin-bottom: 16px;">
        <span class="kart-kategori">${etiketHtml}</span>
        ${post.stage ? `<span class="rozet">${escapeHtml(post.stage)}</span>` : ""}
      </div>
      <h1 class="post-baslik" style="margin-bottom: 24px;">${escapeHtml(post.title)}</h1>
    `;

    if (post.category === "fotograf" && post.image) {
      container.innerHTML = `
        ${metaHtml}
        <div class="post-foto-layout">
          <div class="post-foto-image">
            <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageCaption || post.title)}">
            ${post.imageCaption ? `<p class="post-foto-caption">${escapeHtml(post.imageCaption)}</p>` : ""}
          </div>
          <div class="post-foto-text">${entriesHtml}</div>
        </div>
        ${navHtml}
      `;
    } else {
      container.innerHTML = `${metaHtml}<div class="post-thread">${entriesHtml}</div>${navHtml}`;
    }
  } catch (e) {
    document.title = "Yazı bulunamadı | yigit.club";
    container.innerHTML = '<p style="color:#a1a1aa;">Yazı yüklenemedi.</p>';
    console.error(e);
  }
}

/* ---------- tema ---------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "light" ? "light" : "dark");

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });
}

/* ---------- logo yazma animasyonu ---------- */

function initLogoTyping(boldFull, italicFull) {
  const el = document.getElementById("site-logo");
  if (!el) return;
  const boldEl = el.querySelector(".logo-bold");
  const italicEl = el.querySelector(".logo-italic");
  if (!boldEl || !italicEl) return;

  boldFull = boldFull || "yigit.";
  italicFull = italicFull || "club";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    boldEl.textContent = boldFull;
    italicEl.textContent = italicFull;
    return;
  }

  let i = 0;
  const full = boldFull + italicFull;
  const timer = setInterval(() => {
    i += 1;
    boldEl.textContent = full.slice(0, i).slice(0, boldFull.length);
    italicEl.textContent = full.slice(boldFull.length, i);
    if (i >= full.length) clearInterval(timer);
  }, 90);
}

/* ---------- arama ---------- */

function renderSearchResults(matches, box, pathPrefix, categories) {
  if (matches.length === 0) {
    box.innerHTML = '<div class="search-empty">Sonuç bulunamadı</div>';
  } else {
    box.innerHTML = matches
      .map(
        (p) => `
      <a class="search-result" href="${pathPrefix}post.html?slug=${encodeURIComponent(p.slug)}">
        <span class="search-result-title">${escapeHtml(p.title)}</span>
        <span class="search-result-meta kart-kategori">${escapeHtml(categoryLabel(p.category, categories))}</span>
      </a>
    `
      )
      .join("");
  }
  box.classList.add("open");
}

function initSearch(pathPrefix) {
  const input = document.getElementById("site-search");
  const box = document.getElementById("search-results");
  if (!input || !box) return;

  input.addEventListener("input", async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      box.innerHTML = "";
      box.classList.remove("open");
      return;
    }
    try {
      const [posts, categories] = await Promise.all([fetchAllNotlar(pathPrefix), fetchCategories(pathPrefix)]);
      const matches = posts
        .filter(
          (p) =>
            (p.title || "").toLowerCase().includes(q) ||
            (p.category || "").toLowerCase().includes(q) ||
            (p.subcategory || "").toLowerCase().includes(q)
        )
        .slice(0, 8);
      renderSearchResults(matches, box, pathPrefix, categories);
    } catch (e) {
      console.error(e);
    }
  });

  input.addEventListener("focus", () => {
    if (box.innerHTML) box.classList.add("open");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-search")) box.classList.remove("open");
  });
}

/* ---------- mobil menü ---------- */

function initMobileMenu() {
  const btn = document.getElementById("menu-toggle");
  const panel = document.getElementById("header-right");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("open")) return;
    if (e.target.closest("#header-right") || e.target.closest("#menu-toggle")) return;
    panel.classList.remove("open");
  });
}

/* ---------- ana sayfa özeti ---------- */

async function renderOzet(fetchPrefix) {
  const el = document.getElementById("ozet");
  if (!el) return;
  try {
    const res = await fetch(`${fetchPrefix}${OZET_FILE}?t=${Date.now()}`);
    if (!res.ok) return;
    const data = await res.json();
    el.innerHTML = window.marked ? marked.parse(data.text || "") : escapeHtml(data.text || "");
  } catch (e) {
    console.error(e);
  }
}
