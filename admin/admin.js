const REPO = "yigitpekzeren/yigit.club";
const BRANCH = "main";
const DATA_FOLDER = "notlar-data";
const IMAGES_FOLDER = "images";
const TOKEN_KEY = "yigitclub_admin_token";

const uiState = { editingSlug: null, editingSha: null, slugTouched: false };
const state = { posts: [] };

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

function slugify(str) {
  const map = { ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u" };
  return (str || "")
    .split("").map((ch) => map[ch] ?? ch).join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "yazi";
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
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "gorsel";
  const filename = `${Date.now()}-${base}.${ext}`;
  const path = `${IMAGES_FOLDER}/${filename}`;
  const base64 = await fileToBase64(file);
  await ghPutFile(path, base64, `Görsel yükle: ${filename}`);
  return path;
}

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

function dashboardHTML() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="admin-dashboard">
      <div class="admin-topbar">
        <h1>Yönetim Paneli</h1>
        <button id="logout-btn" class="btn-secondary">Çıkış Yap</button>
      </div>

      <div class="admin-columns">
        <section class="admin-form-section">
          <h2 id="form-title">Yeni Yazı</h2>
          <form id="post-form" class="admin-form">
            <label for="f-title">Başlık</label>
            <input type="text" id="f-title" required>

            <label for="f-slug">Slug (dosya adı)</label>
            <input type="text" id="f-slug" required>

            <label for="f-date">Tarih</label>
            <input type="date" id="f-date" value="${today}" required>

            <label for="f-category">Ana Kategori</label>
            <select id="f-category">
              <option value="genel">genel</option>
              <option value="miras">miras</option>
              <option value="hobiler">hobiler</option>
              <option value="atolye">atolye</option>
            </select>

            <label for="f-subcategory">Alt Kategori (opsiyonel)</label>
            <input type="text" id="f-subcategory">

            <label for="f-stage">Kahve Aşaması</label>
            <select id="f-stage">
              <option value="🫘 Çekirdek">🫘 Çekirdek</option>
              <option value="⏳ Demleniyor">⏳ Demleniyor</option>
              <option value="☕ Fincanda">☕ Fincanda</option>
            </select>

            <label for="f-image-file">Görsel (opsiyonel, yüklemek için seç)</label>
            <input type="file" id="f-image-file" accept="image/*">
            <input type="hidden" id="f-image-existing">

            <label for="f-body">İçerik (markdown)</label>
            <textarea id="f-body" rows="10" required></textarea>

            <p id="form-error" style="color:#f87171; min-height:18px;"></p>
            <div class="admin-form-actions">
              <button type="submit" id="submit-btn">Yayınla</button>
              <button type="button" id="cancel-edit-btn" style="display:none;" class="btn-secondary">İptal</button>
            </div>
          </form>
        </section>

        <section class="admin-list-section">
          <h2>Yazılar</h2>
          <div id="post-list"><p style="color:#a1a1aa;">Yükleniyor...</p></div>
        </section>
      </div>
    </div>
  `;
}

function postRowHTML(p) {
  return `
    <div class="admin-post-row">
      <div>
        <div class="admin-post-title">${escapeHtml(p.title)}</div>
        <div class="admin-post-meta">${escapeHtml(p.category || "genel")} · ${escapeHtml(p.date || "")}</div>
      </div>
      <div class="admin-post-actions">
        <button data-action="edit" data-slug="${escapeHtml(p.slug)}">Düzenle</button>
        <button data-action="delete" data-slug="${escapeHtml(p.slug)}" data-sha="${escapeHtml(p.sha)}" class="btn-danger">Sil</button>
      </div>
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

function resetForm() {
  uiState.editingSlug = null;
  uiState.editingSha = null;
  uiState.slugTouched = false;
  const form = document.getElementById("post-form");
  form.reset();
  document.getElementById("f-slug").disabled = false;
  document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("f-image-existing").value = "";
  document.getElementById("form-title").textContent = "Yeni Yazı";
  document.getElementById("submit-btn").textContent = "Yayınla";
  document.getElementById("cancel-edit-btn").style.display = "none";
  document.getElementById("form-error").textContent = "";
}

function handleEdit(slug) {
  const p = state.posts.find((x) => x.slug === slug);
  if (!p) return;
  uiState.editingSlug = slug;
  uiState.editingSha = p.sha;
  uiState.slugTouched = true;

  document.getElementById("f-title").value = p.title || "";
  document.getElementById("f-slug").value = p.slug;
  document.getElementById("f-slug").disabled = true;
  document.getElementById("f-date").value = (p.date || "").slice(0, 10);
  document.getElementById("f-category").value = p.category || "genel";
  document.getElementById("f-subcategory").value = p.subcategory || "";
  document.getElementById("f-stage").value = p.stage || "🫘 Çekirdek";
  document.getElementById("f-image-existing").value = p.image || "";
  document.getElementById("f-body").value = p.body || "";
  document.getElementById("form-title").textContent = `Düzenle: ${p.title}`;
  document.getElementById("submit-btn").textContent = "Güncelle";
  document.getElementById("cancel-edit-btn").style.display = "";

  document.getElementById("post-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleDelete(slug, sha) {
  if (!confirm(`"${slug}" yazısını kalıcı olarak silmek istediğine emin misin?`)) return;
  try {
    await ghDeleteFile(`${DATA_FOLDER}/${slug}.json`, sha, `Sil: ${slug}`);
    if (uiState.editingSlug === slug) resetForm();
    await loadPosts();
  } catch (e) {
    alert(`Silinemedi: ${e.message}`);
  }
}

function onListClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const slug = btn.dataset.slug;
  if (btn.dataset.action === "edit") handleEdit(slug);
  if (btn.dataset.action === "delete") handleDelete(slug, btn.dataset.sha);
}

async function onPostSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");
  errorEl.textContent = "";

  const title = document.getElementById("f-title").value.trim();
  let slug = document.getElementById("f-slug").value.trim();
  const date = document.getElementById("f-date").value;
  const category = document.getElementById("f-category").value;
  const subcategory = document.getElementById("f-subcategory").value.trim();
  const stage = document.getElementById("f-stage").value;
  const body = document.getElementById("f-body").value;
  const imageFile = document.getElementById("f-image-file").files[0];
  let image = document.getElementById("f-image-existing").value || "";

  if (!title || !slug || !date || !body) {
    errorEl.textContent = "Başlık, slug, tarih ve içerik zorunlu.";
    return;
  }
  slug = slugify(slug);

  submitBtn.disabled = true;
  submitBtn.textContent = uiState.editingSlug ? "Güncelleniyor..." : "Yayınlanıyor...";

  try {
    if (imageFile) {
      image = await uploadImage(imageFile);
    }

    const path = `${DATA_FOLDER}/${slug}.json`;
    let sha = uiState.editingSha;

    if (!uiState.editingSlug) {
      const existing = await ghGetFile(path);
      if (existing) {
        if (!confirm(`"${slug}" zaten var. Üzerine yazılsın mı?`)) {
          return;
        }
        sha = existing.sha;
      }
    }

    const post = { title, date, category, subcategory, stage, image, body };
    const content = utf8ToBase64(JSON.stringify(post, null, 2) + "\n");
    const message = uiState.editingSlug ? `Güncelle: ${slug}` : `Yeni yazı: ${slug}`;
    await ghPutFile(path, content, message, sha);

    resetForm();
    await loadPosts();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = uiState.editingSlug ? "Güncelle" : "Yayınla";
  }
}

async function loadPosts() {
  const listEl = document.getElementById("post-list");
  listEl.innerHTML = '<p style="color:#a1a1aa;">Yükleniyor...</p>';
  try {
    const files = (await ghListFolder(DATA_FOLDER)).filter((f) => f.name.endsWith(".json"));
    const posts = await Promise.all(
      files.map(async (f) => {
        const res = await fetch(f.download_url);
        const data = await res.json();
        return { ...data, slug: f.name.replace(/\.json$/, ""), sha: f.sha };
      })
    );
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    state.posts = posts;
    listEl.innerHTML = posts.map(postRowHTML).join("") || '<p style="color:#a1a1aa;">Henüz yazı yok.</p>';
  } catch (e) {
    listEl.innerHTML = `<p style="color:#f87171;">Yazılar yüklenemedi: ${escapeHtml(e.message)}</p>`;
  }
}

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

  document.getElementById("cancel-edit-btn").addEventListener("click", resetForm);
  document.getElementById("post-form").addEventListener("submit", onPostSubmit);
  document.getElementById("post-list").addEventListener("click", onListClick);
}

function renderRoot() {
  const root = document.getElementById("admin-root");
  if (!getToken()) {
    root.innerHTML = gateHTML();
    document.getElementById("token-form").addEventListener("submit", onTokenSubmit);
    return;
  }
  root.innerHTML = dashboardHTML();
  wireDashboard();
  loadPosts();
}

function initAdmin() {
  renderRoot();
}
