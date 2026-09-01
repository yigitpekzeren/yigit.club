const CMS_REPO = "yigitpekzeren/yigit.club";
const CMS_BRANCH = "main";
const DATA_FOLDER = "notlar-data";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
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
  return `
    <a href="${pathPrefix}post.html?slug=${encodeURIComponent(post.slug)}" class="kart${buyuk ? " buyuk" : ""}">
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

    const tarih = post.date
      ? new Date(post.date).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" })
      : "";
    const bodyHtml = window.marked ? marked.parse(post.body || "") : escapeHtml(post.body || "");

    container.innerHTML = `
      <div class="kart-ust" style="margin-bottom: 16px;">
        <span>${escapeHtml(post.category || "genel")}${post.subcategory ? " / " + escapeHtml(post.subcategory) : ""}</span>
        ${post.stage ? `<span class="rozet">${escapeHtml(post.stage)}</span>` : ""}
      </div>
      <h1 style="margin-bottom: 8px;">${escapeHtml(post.title)}</h1>
      ${tarih ? `<p style="color:#71717a; font-size:13px; margin-bottom:24px;">${tarih}</p>` : ""}
      ${post.image ? `<img src="${escapeHtml(post.image)}" alt="" style="max-width:100%; border-radius:12px; margin-bottom:24px;">` : ""}
      <div class="icerik">${bodyHtml}</div>
    `;
  } catch (e) {
    container.innerHTML = '<p style="color:#a1a1aa;">Yazı yüklenemedi.</p>';
    console.error(e);
  }
}
