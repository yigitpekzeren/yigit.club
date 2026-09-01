const CMS_REPO = "yigitpekzeren/yigit.club";
const CMS_BRANCH = "main";
const DATA_FOLDER = "notlar-data";
const CATEGORIES_FILE = "kategoriler.json";
const OZET_FILE = "ozet.json";
const THEME_KEY = "yigitclub_theme";

let __notlarCache = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });
  if (!iso.includes("T")) return datePart;
  const timePart = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

async function renderNav(fetchPrefix, navPrefix) {
  const nav = document.getElementById("site-nav");
  if (!nav) return;
  try {
    const res = await fetch(`${fetchPrefix}${CATEGORIES_FILE}?t=${Date.now()}`);
    const cats = await res.json();
    nav.innerHTML = cats
      .map((c) => `<a href="${navPrefix}${encodeURIComponent(c.slug)}.html">${escapeHtml(c.label)}</a>`)
      .join("");
  } catch (e) {
    console.error(e);
  }
}

async function fetchAllNotlar() {
  if (__notlarCache) return __notlarCache;

  const listUrl = `https://api.github.com/repos/${CMS_REPO}/contents/${DATA_FOLDER}?ref=${CMS_BRANCH}`;
  const listRes = await fetch(listUrl);
  if (!listRes.ok) throw new Error("Yazı listesi alınamadı");
  const files = await listRes.json();
  const jsonFiles = files.filter((f) => f.name.endsWith(".json"));

  const posts = await Promise.all(
    jsonFiles.map(async (f) => {
      const res = await fetch(f.download_url);
      const data = await res.json();
      return { ...data, slug: f.name.replace(/\.json$/, "") };
    })
  );

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  __notlarCache = posts;
  return posts;
}

function kartHTML(post, pathPrefix, buyuk) {
  const kategoriEtiket = post.category || "genel";
  const rozet = post.stage || "";
  const href = `${pathPrefix}post.html?slug=${encodeURIComponent(post.slug)}`;

  if (post.category === "fotograf" && post.image) {
    return `
      <a href="${href}" class="kart kart-foto${buyuk ? " buyuk" : ""}" style="background-image:url('${pathPrefix}${escapeHtml(post.image)}')">
        <div class="kart-ust">
          <span>${escapeHtml(kategoriEtiket)}</span>
          ${rozet ? `<span class="rozet">${escapeHtml(rozet)}</span>` : ""}
        </div>
        <div>
          <div class="kart-baslik">${escapeHtml(post.title)}</div>
          ${post.imageCaption ? `<div class="kart-foto-caption">${escapeHtml(post.imageCaption)}</div>` : ""}
        </div>
      </a>
    `;
  }

  return `
    <a href="${href}" class="kart${buyuk ? " buyuk" : ""}">
      <div class="kart-ust">
        <span>${escapeHtml(kategoriEtiket)}</span>
        ${rozet ? `<span class="rozet">${escapeHtml(rozet)}</span>` : ""}
      </div>
      <div class="kart-baslik">${escapeHtml(post.title)}</div>
    </a>
  `;
}

async function renderGrid(containerSelector, { pathPrefix = "" } = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const category = container.dataset.category || null;

  try {
    let posts = await fetchAllNotlar();
    if (category) posts = posts.filter((p) => p.category === category);

    if (posts.length === 0) {
      container.innerHTML = '<p style="color:#a1a1aa;">Bu kategoride henüz yazı yok.</p>';
      return;
    }

    container.innerHTML = posts
      .map((p, i) => kartHTML(p, pathPrefix, i === 0 && !category))
      .join("");
  } catch (e) {
    container.innerHTML = '<p style="color:#a1a1aa;">Yazılar yüklenemedi.</p>';
    console.error(e);
  }
}

function entryHTML(entry) {
  const bodyHtml = window.marked ? marked.parse(entry.body || "") : escapeHtml(entry.body || "");
  return `
    <div class="post-entry">
      <div class="icerik">${bodyHtml}</div>
      <div class="post-entry-time">${formatDateTime(entry.date)}</div>
    </div>
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

    const entries = [...(post.entries || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
    const entriesHtml = entries.map(entryHTML).join("");

    const metaHtml = `
      <div class="kart-ust" style="margin-bottom: 16px;">
        <span>${escapeHtml(post.category || "genel")}${post.subcategory ? " / " + escapeHtml(post.subcategory) : ""}</span>
        ${post.stage ? `<span class="rozet">${escapeHtml(post.stage)}</span>` : ""}
      </div>
      <h1 style="margin-bottom: 24px;">${escapeHtml(post.title)}</h1>
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
      `;
    } else {
      container.innerHTML = `${metaHtml}<div class="post-thread">${entriesHtml}</div>`;
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

function initLogoTyping() {
  const el = document.getElementById("site-logo");
  if (!el) return;
  const boldEl = el.querySelector(".logo-bold");
  const italicEl = el.querySelector(".logo-italic");
  if (!boldEl || !italicEl) return;

  const boldFull = "yigit.";
  const italicFull = "club";

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

function renderSearchResults(matches, box, pathPrefix) {
  if (matches.length === 0) {
    box.innerHTML = '<div class="search-empty">Sonuç bulunamadı</div>';
  } else {
    box.innerHTML = matches
      .map(
        (p) => `
      <a class="search-result" href="${pathPrefix}post.html?slug=${encodeURIComponent(p.slug)}">
        <span class="search-result-title">${escapeHtml(p.title)}</span>
        <span class="search-result-meta">${escapeHtml(p.category || "genel")}</span>
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
      const posts = await fetchAllNotlar();
      const matches = posts
        .filter(
          (p) =>
            (p.title || "").toLowerCase().includes(q) ||
            (p.category || "").toLowerCase().includes(q) ||
            (p.subcategory || "").toLowerCase().includes(q)
        )
        .slice(0, 8);
      renderSearchResults(matches, box, pathPrefix);
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
