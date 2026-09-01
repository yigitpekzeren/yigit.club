const CMS_REPO = "yigitpekzeren/yigit.club";
const CMS_BRANCH = "main";
const DATA_FOLDER = "notlar-data";
const CATEGORIES_FILE = "kategoriler.json";

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
    const res = await fetch(`${fetchPrefix}${CATEGORIES_FILE}`);
    const cats = await res.json();
    nav.innerHTML = cats
      .map((c) => `<a href="${navPrefix}${encodeURIComponent(c.slug)}.html">${escapeHtml(c.label)}</a>`)
      .join("");
  } catch (e) {
    console.error(e);
  }
}

async function fetchAllNotlar() {
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
    const res = await fetch(`${DATA_FOLDER}/${encodeURIComponent(slug)}.json`);
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
    container.innerHTML = '<p style="color:#a1a1aa;">Yazı yüklenemedi.</p>';
    console.error(e);
  }
}
