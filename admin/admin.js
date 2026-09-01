const REPO = "yigitpekzeren/yigit.club";
const BRANCH = "main";
const POSTS_FOLDER = "notlar-data";
const IMAGES_FOLDER = "images";
const KATEGORILER_DOSYASI = "kategoriler.json";
const TOKEN_KEY = "yigitclub_admin_token";
const CROP_W = 320;
const CROP_H = 240;

const state = { posts: [], categories: [], categoriesSha: null, croppedBlob: null };
const uiState = { mode: "new-post", targetSlug: null, targetSha: null, targetPost: null, slugTouched: false };
const cropState = { img: null, scale: 1, offsetX: 0, offsetY: 0, naturalW: 0, naturalH: 0, dragging: false, lastX: 0, lastY: 0 };

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function ghHeaders() {
  return { Authorization: `token ${getToken()}`, Accept: "application/vnd.github+json" };
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function slugify(str) {
  const map = { ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u" };
  return (str || "")
    .split("").map((ch) => map[ch] ?? ch).join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "yazi";
}

function formatDateTimeAdmin(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("tr-TR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function ghGetFile(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API hatası (${res.status})`);
  return res.json();
}

async function ghListFolder(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, { headers: ghHeaders() });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub API hatası (${res.status})`);
  return res.json();
}

async function ghPutFile(path, contentBase64, message, sha) {
  const body = { message, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API hatası (${res.status})`);
  }
  return res.json();
}

async function ghDeleteFile(path, sha, message) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "DELETE",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API hatası (${res.status})`);
  }
  return res.json();
}

async function uploadImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "gorsel";
  const filename = `${Date.now()}-${base}.${ext}`;
  const path = `${IMAGES_FOLDER}/${filename}`;
  const base64 = await fileToBase64(file);
  await ghPutFile(path, base64, `Görsel yükle: ${filename}`);
  return path;
}

/* ---------- kategoriler ---------- */

async function loadCategories() {
  const data = await ghGetFile(KATEGORILER_DOSYASI);
  if (data) {
    state.categoriesSha = data.sha;
    state.categories = JSON.parse(base64ToUtf8(data.content));
  } else {
    state.categories = [];
    state.categoriesSha = null;
  }
}

async function saveCategories(list) {
  const content = utf8ToBase64(JSON.stringify(list, null, 2) + "\n");
  const res = await ghPutFile(KATEGORILER_DOSYASI, content, "Kategori listesini güncelle", state.categoriesSha);
  state.categoriesSha = res.content.sha;
}

function kategoriPageTemplate(slug, label) {
  const safeLabel = escapeHtml(label);
  return `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeLabel} | yigit.club</title>
    <link rel="stylesheet" href="../css/style.css">
  </head>
  <body>

    <header>
      <a href="../index.html" class="logo">yigit.club</a>
      <nav id="site-nav"></nav>
    </header>

    <h1 style="margin-bottom: 24px;">${safeLabel}</h1>

    <div class="grid" id="posts-grid" data-category="${escapeHtml(slug)}">
      <p style="color:#a1a1aa;">Yükleniyor...</p>
    </div>

    <script src="../js/site.js"></script>
    <script>
      renderNav("../", "");
      renderGrid("#posts-grid", { pathPrefix: "../" });
    </script>

  </body>
</html>
`;
}

function categoryOptionsHtml(selected) {
  const opts = [{ slug: "genel", label: "genel" }, ...state.categories];
  return opts
    .map((c) => `<option value="${escapeHtml(c.slug)}" ${c.slug === selected ? "selected" : ""}>${escapeHtml(c.label)}</option>`)
    .join("");
}

function refreshCategorySelect() {
  const select = document.getElementById("f-category");
  const current = select.value;
  select.innerHTML = categoryOptionsHtml(current);
}

async function handleAddCategory() {
  const input = document.getElementById("new-category-label");
  const label = input.value.trim();
  if (!label) return;
  const slug = slugify(label);
  const taken = slug === "genel" || state.categories.some((c) => c.slug === slug);
  if (taken) {
    alert("Bu kategori zaten var.");
    return;
  }
  const btn = document.getElementById("confirm-add-category");
  btn.disabled = true;
  try {
    const newList = [...state.categories, { slug, label }];
    await saveCategories(newList);
    state.categories = newList;
    await ghPutFile(`kategori/${slug}.html`, utf8ToBase64(kategoriPageTemplate(slug, label)), `Yeni kategori sayfası: ${slug}`);
    input.value = "";
    document.getElementById("new-category-form").style.display = "none";
    refreshCategorySelect();
    document.getElementById("f-category").value = slug;
    updatePhotoBlockVisibility();
  } catch (e) {
    alert(`Kategori eklenemedi: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- markdown toolbar ---------- */

function applyMdFormat(textarea, type) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  let before = "";
  let after = "";
  let placeholder = "metin";

  if (type === "bold") { before = "**"; after = "**"; }
  else if (type === "italic") { before = "_"; after = "_"; }
  else if (type === "h2") { before = "\n## "; placeholder = "Başlık"; }
  else if (type === "link") { before = "["; after = "](https://)"; placeholder = "bağlantı metni"; }
  else if (type === "list") { before = "\n- "; placeholder = "madde"; }

  const text = selected || placeholder;
  textarea.value = value.slice(0, start) + before + text + after + value.slice(end);
  const cursorStart = start + before.length;
  const cursorEnd = cursorStart + text.length;
  textarea.focus();
  textarea.setSelectionRange(cursorStart, cursorEnd);
}

/* ---------- fotoğraf kırpma ---------- */

function initCropperImage(imgEl) {
  cropState.img = imgEl;
  cropState.naturalW = imgEl.naturalWidth;
  cropState.naturalH = imgEl.naturalHeight;
  cropState.scale = Math.max(CROP_W / imgEl.naturalWidth, CROP_H / imgEl.naturalHeight);
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  document.getElementById("cropper-zoom").value = "1";
  applyCropTransform();
}

function clampOffsets() {
  const w = cropState.naturalW * cropState.scale;
  const h = cropState.naturalH * cropState.scale;
  const maxX = Math.max(0, (w - CROP_W) / 2);
  const maxY = Math.max(0, (h - CROP_H) / 2);
  cropState.offsetX = Math.min(maxX, Math.max(-maxX, cropState.offsetX));
  cropState.offsetY = Math.min(maxY, Math.max(-maxY, cropState.offsetY));
}

function applyCropTransform() {
  if (!cropState.img) return;
  const w = cropState.naturalW * cropState.scale;
  const h = cropState.naturalH * cropState.scale;
  cropState.img.style.width = `${w}px`;
  cropState.img.style.height = `${h}px`;
  cropState.img.style.transform = `translate(calc(-50% + ${cropState.offsetX}px), calc(-50% + ${cropState.offsetY}px))`;
}

function cropToBlob() {
  const outW = CROP_W * 2;
  const outH = CROP_H * 2;
  const scaleRatio = outW / CROP_W;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  const drawW = cropState.naturalW * cropState.scale * scaleRatio;
  const drawH = cropState.naturalH * cropState.scale * scaleRatio;
  const drawX = outW / 2 - drawW / 2 + cropState.offsetX * scaleRatio;
  const drawY = outH / 2 - drawH / 2 + cropState.offsetY * scaleRatio;
  ctx.drawImage(cropState.img, drawX, drawY, drawW, drawH);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

function wireCropper() {
  const fileInput = document.getElementById("f-photo-file");
  const viewport = document.getElementById("cropper-viewport");
  const img = document.getElementById("cropper-img");
  const zoom = document.getElementById("cropper-zoom");
  const applyBtn = document.getElementById("cropper-apply");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => initCropperImage(img);
      img.src = reader.result;
      document.getElementById("cropper-wrap").style.display = "";
      document.getElementById("photo-preview").style.display = "none";
      state.croppedBlob = null;
    };
    reader.readAsDataURL(file);
  });

  viewport.addEventListener("mousedown", (e) => {
    cropState.dragging = true;
    cropState.lastX = e.clientX;
    cropState.lastY = e.clientY;
  });
  window.addEventListener("mousemove", (e) => {
    if (!cropState.dragging) return;
    cropState.offsetX += e.clientX - cropState.lastX;
    cropState.offsetY += e.clientY - cropState.lastY;
    cropState.lastX = e.clientX;
    cropState.lastY = e.clientY;
    clampOffsets();
    applyCropTransform();
  });
  window.addEventListener("mouseup", () => { cropState.dragging = false; });

  zoom.addEventListener("input", () => {
    const coverScale = Math.max(CROP_W / cropState.naturalW, CROP_H / cropState.naturalH);
    cropState.scale = coverScale * parseFloat(zoom.value);
    clampOffsets();
    applyCropTransform();
  });

  applyBtn.addEventListener("click", async () => {
    const blob = await cropToBlob();
    state.croppedBlob = blob;
    const preview = document.getElementById("photo-preview");
    preview.src = URL.createObjectURL(blob);
    preview.style.display = "";
    document.getElementById("cropper-wrap").style.display = "none";
  });
}

function updatePhotoBlockVisibility() {
  const category = document.getElementById("f-category").value;
  document.getElementById("photo-block").style.display = category === "fotograf" ? "" : "none";
}

/* ---------- login gate ---------- */

function gateHTML() {
  return `
    <div class="admin-gate">
      <h1 style="margin-bottom: 8px;">Yönetim Paneli</h1>
      <p style="color:#a1a1aa; margin-bottom:24px;">
        Bu panel, kendi GitHub kişisel erişim token'ınla doğrudan bu repoya yazıyor.
        Token yalnızca bu tarayıcıda (localStorage) saklanır, hiçbir sunucuya gönderilmez.
      </p>
      <form id="token-form" class="admin-form">
        <label for="token-input">GitHub Personal Access Token</label>
        <input type="password" id="token-input" placeholder="github_pat_..." autocomplete="off" required>
        <p id="token-error" style="color:#f87171; font-size:13px; min-height:18px;"></p>
        <button type="submit">Giriş Yap</button>
      </form>
      <details style="margin-top:24px; color:#a1a1aa; font-size:14px;">
        <summary style="cursor:pointer; color:#f4f4f5;">Token nasıl oluşturulur?</summary>
        <ol style="margin-top:12px; padding-left:20px; line-height:1.8;">
          <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained tokens</a> sayfasını aç.</li>
          <li>"Repository access" → "Only select repositories" → <code>yigitpekzeren/yigit.club</code> seç.</li>
          <li>"Permissions" → "Repository permissions" → <strong>Contents: Read and write</strong> seç.</li>
          <li>Token'ı oluştur ve buraya yapıştır.</li>
        </ol>
      </details>
    </div>
  `;
}

async function onTokenSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("token-input");
  const errorEl = document.getElementById("token-error");
  const token = input.value.trim();
  errorEl.textContent = "";
  if (!token) return;

  try {
    const res = await fetch("https://api.github.com/user", { headers: { Authorization: `token ${token}` } });
    if (!res.ok) throw new Error("Token geçersiz veya yetkisiz.");
    localStorage.setItem(TOKEN_KEY, token);
    renderRoot();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

/* ---------- dashboard markup ---------- */

function dashboardHTML() {
  return `
    <div class="admin-dashboard">
      <div class="admin-topbar">
        <h1>Yönetim Paneli</h1>
        <button id="logout-btn" class="btn-secondary">Çıkış Yap</button>
      </div>

      <div class="admin-columns-3">
        <section class="admin-col-meta">
          <h2 id="form-title">Yeni Yazı</h2>
          <form id="post-form" class="admin-form">
            <label for="f-title">Başlık</label>
            <input type="text" id="f-title" required>

            <label for="f-slug">Slug <span class="hint">dosya/URL adı</span></label>
            <input type="text" id="f-slug" class="slug-input" required>

            <label for="f-category">Ana Kategori</label>
            <div class="category-row">
              <select id="f-category">${categoryOptionsHtml("genel")}</select>
              <button type="button" id="add-category-btn" class="btn-secondary" title="Yeni kategori ekle">+</button>
            </div>
            <div id="new-category-form" class="new-category-form" style="display:none;">
              <input type="text" id="new-category-label" placeholder="Kategori adı (örn: Seyahat)">
              <button type="button" id="confirm-add-category" class="btn-secondary">Ekle</button>
            </div>

            <label for="f-subcategory">Alt Kategori (opsiyonel)</label>
            <input type="text" id="f-subcategory">

            <label for="f-stage">Kahve Aşaması</label>
            <select id="f-stage">
              <option value="🫘 Çekirdek">🫘 Çekirdek</option>
              <option value="⏳ Demleniyor">⏳ Demleniyor</option>
              <option value="☕ Fincanda">☕ Fincanda</option>
            </select>

            <div id="f-datetime-row">
              <label for="f-datetime">Tarih ve Saat</label>
              <input type="datetime-local" id="f-datetime">
            </div>

            <p id="form-error" style="color:#f87171; min-height:18px;"></p>
            <div class="admin-form-actions">
              <button type="submit" id="submit-btn">Yayınla</button>
              <button type="button" id="cancel-edit-btn" style="display:none;" class="btn-secondary">İptal</button>
            </div>
          </form>
        </section>

        <section class="admin-col-content">
          <div id="f-body-row">
            <div id="photo-block" class="photo-block" style="display:none;">
              <label>Fotoğraf</label>
              <input type="file" id="f-photo-file" accept="image/*">
              <div id="cropper-wrap" class="cropper-wrap" style="display:none;">
                <div id="cropper-viewport" class="cropper-viewport">
                  <img id="cropper-img" draggable="false">
                </div>
                <div class="cropper-controls">
                  <input type="range" id="cropper-zoom" min="1" max="3" step="0.01" value="1">
                  <button type="button" id="cropper-apply" class="btn-secondary">Kırp ve Kullan</button>
                </div>
              </div>
              <img id="photo-preview" class="photo-preview" style="display:none;">
              <label for="f-image-caption">Görsel Açıklaması</label>
              <input type="text" id="f-image-caption">
            </div>

            <label for="f-body" style="margin-top:0;">İçerik (markdown)</label>
            <div class="md-toolbar">
              <button type="button" data-md="bold" title="Kalın"><strong>B</strong></button>
              <button type="button" data-md="italic" title="İtalik"><em>i</em></button>
              <button type="button" data-md="h2" title="Başlık">H2</button>
              <button type="button" data-md="link" title="Bağlantı">🔗</button>
              <button type="button" data-md="list" title="Liste">•</button>
            </div>
            <textarea id="f-body" rows="18" placeholder="Markdown içerik..."></textarea>
          </div>
        </section>

        <section class="admin-col-archive">
          <h2>Arşiv</h2>
          <div id="archive-root"><p style="color:#a1a1aa;">Yükleniyor...</p></div>
        </section>
      </div>
    </div>
  `;
}

/* ---------- arşiv ---------- */

function archiveHTML() {
  if (state.posts.length === 0) {
    return '<p style="color:#a1a1aa;">Henüz yazı yok.</p>';
  }
  const byYear = {};
  state.posts.forEach((p) => {
    const year = (p.date || "").slice(0, 4) || "Bilinmiyor";
    (byYear[year] = byYear[year] || []).push(p);
  });
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return years
    .map((year, i) => {
      const posts = [...byYear[year]].sort((a, b) => new Date(b.date) - new Date(a.date));
      return `
        <details class="archive-year" ${i === 0 ? "open" : ""}>
          <summary>${escapeHtml(year)} <span class="archive-count">(${posts.length})</span></summary>
          <div class="archive-posts">${posts.map(archivePostHTML).join("")}</div>
        </details>
      `;
    })
    .join("");
}

function archivePostHTML(p) {
  const expanded = uiState.targetSlug === p.slug;
  return `
    <div class="archive-post${expanded ? " expanded" : ""}">
      <button type="button" class="archive-post-header" data-action="toggle" data-slug="${escapeHtml(p.slug)}">
        <span class="admin-post-title">${escapeHtml(p.title)}</span>
        <span class="admin-post-meta">${escapeHtml(p.category || "genel")}</span>
      </button>
      ${expanded ? archiveExpandedHTML(p) : ""}
    </div>
  `;
}

function archiveExpandedHTML(p) {
  const entries = [...(p.entries || [])]
    .map((e, idx) => ({ ...e, idx }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return `
    <div class="archive-expanded">
      <div class="archive-actions">
        <button type="button" data-action="add-entry" data-slug="${escapeHtml(p.slug)}">+ Yeni Girdi Ekle</button>
        <button type="button" data-action="edit-meta" data-slug="${escapeHtml(p.slug)}" class="btn-secondary">Bilgileri Düzenle</button>
        <button type="button" data-action="delete-post" data-slug="${escapeHtml(p.slug)}" data-sha="${escapeHtml(p.sha)}" class="btn-danger">Yazıyı Sil</button>
      </div>
      <div class="archive-entries">
        ${entries
          .map(
            (e) => `
          <div class="archive-entry">
            <span class="admin-post-meta">${escapeHtml(formatDateTimeAdmin(e.date))}</span>
            <button type="button" class="btn-danger" data-action="delete-entry" data-slug="${escapeHtml(p.slug)}" data-index="${e.idx}">Sil</button>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderArchive() {
  document.getElementById("archive-root").innerHTML = archiveHTML();
}

/* ---------- form modları ---------- */

function resetForm() {
  uiState.mode = "new-post";
  uiState.targetSlug = null;
  uiState.targetSha = null;
  uiState.targetPost = null;
  uiState.slugTouched = false;
  state.croppedBlob = null;

  const form = document.getElementById("post-form");
  form.reset();

  ["f-title", "f-slug", "f-category", "f-subcategory", "f-stage"].forEach((id) => {
    document.getElementById(id).disabled = false;
  });
  document.getElementById("f-datetime-row").style.display = "";
  document.getElementById("f-body-row").style.display = "";
  document.getElementById("f-datetime").value = toLocalDatetimeValue(new Date());
  document.getElementById("f-image-caption").value = "";
  document.getElementById("photo-preview").style.display = "none";
  document.getElementById("cropper-wrap").style.display = "none";
  document.getElementById("f-photo-file").value = "";
  document.getElementById("form-title").textContent = "Yeni Yazı";
  document.getElementById("submit-btn").textContent = "Yayınla";
  document.getElementById("cancel-edit-btn").style.display = "none";
  document.getElementById("form-error").textContent = "";
  updatePhotoBlockVisibility();
}

function toLocalDatetimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fillMetaFields(p) {
  const editable = uiState.mode === "edit-meta";
  document.getElementById("f-title").value = p.title || "";
  document.getElementById("f-title").disabled = !editable;
  document.getElementById("f-slug").value = p.slug;
  document.getElementById("f-slug").disabled = true;
  refreshCategorySelect();
  document.getElementById("f-category").value = p.category || "genel";
  document.getElementById("f-category").disabled = !editable;
  document.getElementById("f-subcategory").value = p.subcategory || "";
  document.getElementById("f-subcategory").disabled = !editable;
  document.getElementById("f-stage").value = p.stage || "🫘 Çekirdek";
  document.getElementById("f-stage").disabled = !editable;
  document.getElementById("f-image-caption").value = p.imageCaption || "";
  document.getElementById("f-datetime-row").style.display = editable ? "none" : "";
  document.getElementById("f-body-row").style.display = editable ? "none" : "";
  document.getElementById("f-datetime").value = toLocalDatetimeValue(new Date());
  document.getElementById("photo-preview").style.display = "none";
  document.getElementById("cropper-wrap").style.display = "none";
  document.getElementById("f-photo-file").value = "";
  state.croppedBlob = null;
  updatePhotoBlockVisibility();
}

function startAddEntry(slug) {
  const p = state.posts.find((x) => x.slug === slug);
  if (!p) return;
  uiState.mode = "add-entry";
  uiState.targetSlug = slug;
  uiState.targetSha = p.sha;
  uiState.targetPost = p;
  fillMetaFields(p);
  document.getElementById("f-body").value = "";
  document.getElementById("form-title").textContent = `Yeni Girdi: ${p.title}`;
  document.getElementById("submit-btn").textContent = "Girdi Ekle";
  document.getElementById("cancel-edit-btn").style.display = "";
  document.getElementById("post-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEditMeta(slug) {
  const p = state.posts.find((x) => x.slug === slug);
  if (!p) return;
  uiState.mode = "edit-meta";
  uiState.targetSlug = slug;
  uiState.targetSha = p.sha;
  uiState.targetPost = p;
  fillMetaFields(p);
  document.getElementById("form-title").textContent = `Bilgileri Düzenle: ${p.title}`;
  document.getElementById("submit-btn").textContent = "Bilgileri Güncelle";
  document.getElementById("cancel-edit-btn").style.display = "";
  document.getElementById("post-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleDeletePost(slug, sha) {
  if (!confirm(`"${slug}" yazısını kalıcı olarak silmek istediğine emin misin?`)) return;
  try {
    await ghDeleteFile(`${POSTS_FOLDER}/${slug}.json`, sha, `Sil: ${slug}`);
    if (uiState.targetSlug === slug) {
      uiState.targetSlug = null;
      resetForm();
    }
    await loadPosts();
    renderArchive();
  } catch (e) {
    alert(`Silinemedi: ${e.message}`);
  }
}

async function handleDeleteEntry(slug, index) {
  const p = state.posts.find((x) => x.slug === slug);
  if (!p) return;
  if (!confirm("Bu girdiyi silmek istediğine emin misin?")) return;
  try {
    const entries = (p.entries || []).filter((_, i) => i !== index);
    const updated = { ...p };
    delete updated.slug;
    delete updated.sha;
    updated.entries = entries;
    const content = utf8ToBase64(JSON.stringify(updated, null, 2) + "\n");
    await ghPutFile(`${POSTS_FOLDER}/${slug}.json`, content, `Girdi sil: ${slug}`, p.sha);
    await loadPosts();
    renderArchive();
  } catch (e) {
    alert(`Girdi silinemedi: ${e.message}`);
  }
}

function onArchiveClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, slug } = btn.dataset;
  if (action === "toggle") {
    uiState.targetSlug = uiState.targetSlug === slug ? null : slug;
    renderArchive();
  } else if (action === "add-entry") {
    startAddEntry(slug);
  } else if (action === "edit-meta") {
    startEditMeta(slug);
  } else if (action === "delete-post") {
    handleDeletePost(slug, btn.dataset.sha);
  } else if (action === "delete-entry") {
    handleDeleteEntry(slug, parseInt(btn.dataset.index, 10));
  }
}

/* ---------- kaydetme ---------- */

async function onPostSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");
  errorEl.textContent = "";

  const title = document.getElementById("f-title").value.trim();
  let slug = document.getElementById("f-slug").value.trim();
  const category = document.getElementById("f-category").value;
  const subcategory = document.getElementById("f-subcategory").value.trim();
  const stage = document.getElementById("f-stage").value;
  const body = document.getElementById("f-body").value;
  const datetimeLocal = document.getElementById("f-datetime").value;
  const isoDatetime = datetimeLocal ? new Date(datetimeLocal).toISOString() : new Date().toISOString();
  const imageCaption = document.getElementById("f-image-caption").value.trim();

  if (!title || !slug) {
    errorEl.textContent = "Başlık ve slug zorunlu.";
    return;
  }
  if (uiState.mode !== "edit-meta" && !body.trim()) {
    errorEl.textContent = "İçerik boş olamaz.";
    return;
  }
  slug = slugify(slug);

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "Kaydediliyor...";

  try {
    let image = (uiState.targetPost && uiState.targetPost.image) || "";
    if (category === "fotograf" && state.croppedBlob) {
      const file = new File([state.croppedBlob], `${slug}.jpg`, { type: "image/jpeg" });
      image = await uploadImage(file);
    }

    let path;
    let sha;
    let post;

    if (uiState.mode === "new-post") {
      path = `${POSTS_FOLDER}/${slug}.json`;
      const existing = await ghGetFile(path);
      if (existing) {
        if (!confirm(`"${slug}" zaten var. Üzerine yazılsın mı?`)) {
          return;
        }
        sha = existing.sha;
      }
      post = { title, date: isoDatetime, category, subcategory, stage, image, imageCaption, entries: [{ date: isoDatetime, body }] };
    } else if (uiState.mode === "add-entry") {
      const target = uiState.targetPost;
      path = `${POSTS_FOLDER}/${target.slug}.json`;
      sha = uiState.targetSha;
      post = { ...target, entries: [...(target.entries || []), { date: isoDatetime, body }] };
      delete post.slug;
      delete post.sha;
    } else {
      const target = uiState.targetPost;
      path = `${POSTS_FOLDER}/${target.slug}.json`;
      sha = uiState.targetSha;
      post = { ...target, title, category, subcategory, stage, image, imageCaption };
      delete post.slug;
      delete post.sha;
    }

    const content = utf8ToBase64(JSON.stringify(post, null, 2) + "\n");
    const message = { "new-post": `Yeni yazı: ${slug}`, "add-entry": `Yeni girdi: ${slug}`, "edit-meta": `Bilgi güncelle: ${slug}` }[uiState.mode];
    await ghPutFile(path, content, message, sha);

    resetForm();
    await loadPosts();
    renderArchive();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

/* ---------- yazı listesi ---------- */

async function loadPosts() {
  try {
    const files = (await ghListFolder(POSTS_FOLDER)).filter((f) => f.name.endsWith(".json"));
    const posts = await Promise.all(
      files.map(async (f) => {
        const res = await fetch(f.download_url);
        const data = await res.json();
        return { ...data, slug: f.name.replace(/\.json$/, ""), sha: f.sha };
      })
    );
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    state.posts = posts;
  } catch (e) {
    document.getElementById("archive-root").innerHTML = `<p style="color:#f87171;">Yazılar yüklenemedi: ${escapeHtml(e.message)}</p>`;
  }
}

/* ---------- kurulum ---------- */

function wireDashboard() {
  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    renderRoot();
  });

  const titleEl = document.getElementById("f-title");
  const slugEl = document.getElementById("f-slug");
  titleEl.addEventListener("input", () => {
    if (!uiState.slugTouched) slugEl.value = slugify(titleEl.value);
  });
  slugEl.addEventListener("input", () => { uiState.slugTouched = true; });

  document.getElementById("f-category").addEventListener("change", updatePhotoBlockVisibility);
  document.getElementById("add-category-btn").addEventListener("click", () => {
    const el = document.getElementById("new-category-form");
    el.style.display = el.style.display === "none" ? "" : "none";
  });
  document.getElementById("confirm-add-category").addEventListener("click", handleAddCategory);

  document.querySelectorAll(".md-toolbar button").forEach((btn) => {
    btn.addEventListener("click", () => applyMdFormat(document.getElementById("f-body"), btn.dataset.md));
  });

  wireCropper();

  document.getElementById("cancel-edit-btn").addEventListener("click", resetForm);
  document.getElementById("post-form").addEventListener("submit", onPostSubmit);
  document.getElementById("archive-root").addEventListener("click", onArchiveClick);

  document.getElementById("f-datetime").value = toLocalDatetimeValue(new Date());
}

async function renderRoot() {
  const root = document.getElementById("admin-root");
  if (!getToken()) {
    root.innerHTML = gateHTML();
    document.getElementById("token-form").addEventListener("submit", onTokenSubmit);
    return;
  }

  root.innerHTML = '<p style="color:#a1a1aa;">Yükleniyor...</p>';
  try {
    await loadCategories();
  } catch (e) {
    state.categories = [];
  }

  root.innerHTML = dashboardHTML();
  wireDashboard();
  await loadPosts();
  renderArchive();
}

function initAdmin() {
  renderRoot();
}
