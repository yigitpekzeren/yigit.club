const REPO = "yigitpekzeren/yigit.club";
const BRANCH = "main";

/* Taslaklar AYRI ve GİZLİ bir depoda tutulur.
   Site deposu herkese açık olduğu için oraya yazılan her şey (silinse bile
   git geçmişinde) herkes tarafından okunabilir olurdu. Yayınlanmamış yazılar
   bu yüzden hiç oraya yazılmıyor. */
const DRAFTS_REPO = "yigitpekzeren/yigit.club-taslaklar";
const POSTS_FOLDER = "notlar-data";
const INDEX_FILENAME = "index.json";
const SEARCH_FILENAME = "arama.json";
const DRAFTS_FOLDER = "taslaklar-data";
const IMAGES_FOLDER = "images";
const KATEGORILER_DOSYASI = "kategoriler.json";
const OZET_DOSYASI = "ozet.json";
const HAKKINDA_DOSYASI = "hakkinda.json";
const TOKEN_KEY = "yigitclub_admin_token";
const CROP_W = 320;
const CROP_H = 240;

const state = { posts: [], drafts: [], draftsRepoHazir: null, categories: [], categoriesSha: null, croppedBlob: null, ozetSha: null, hakkindaSha: null };
const uiState = { mode: "new-post", targetSlug: null, targetSha: null, targetPost: null, slugTouched: false, editingEntryIndex: null, draftSlug: null, draftSha: null };
const cropState = { img: null, scale: 1, offsetX: 0, offsetY: 0, naturalW: 0, naturalH: 0, dragging: false, lastX: 0, lastY: 0 };

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

let __toastTimer = null;

function showToast(message, isError) {
  let toast = document.getElementById("admin-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "admin-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `admin-toast show${isError ? " error" : ""}`;
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
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

function base64ToBlob(b64, type = "image/jpeg") {
  const binary = atob(b64);
  return new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], { type });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function ghGetFile(path, repo = REPO) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${BRANCH}`, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API hatası (${res.status})`);
  return res.json();
}

async function ghListFolder(path, repo = REPO) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${BRANCH}`, { headers: ghHeaders() });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub API hatası (${res.status})`);
  return res.json();
}

async function ghPutFile(path, contentBase64, message, sha, repo = REPO) {
  const body = { message, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
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

async function ghDeleteFile(path, sha, message, repo = REPO) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
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

async function ghDepoErisilebilirMi(repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders() });
    return res.ok;
  } catch (e) {
    return false;
  }
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

/* ---------- ana sayfa özeti ---------- */

/* Özet de yazı içeriği gibi zengin metin. Eski kayıtlar markdown olduğu için
   format alanı yoksa markdown varsayılıp HTML'e çevrilir. */
async function loadOzet() {
  const data = await ghGetFile(OZET_DOSYASI);
  if (data) {
    state.ozetSha = data.sha;
    const kayit = JSON.parse(base64ToUtf8(data.content));
    return { text: kayit.text || "", format: kayit.format || "markdown" };
  }
  state.ozetSha = null;
  return { text: "", format: "html" };
}

async function handleSaveOzet() {
  const editor = document.getElementById("f-ozet");
  const statusEl = document.getElementById("ozet-status");
  const btn = document.getElementById("ozet-save-btn");
  const text = sanitizeEditorHtml(editor.innerHTML).trim();

  btn.disabled = true;
  statusEl.textContent = "Kaydediliyor...";
  try {
    const content = utf8ToBase64(JSON.stringify({ text, format: "html" }, null, 2) + "\n");
    const res = await ghPutFile(OZET_DOSYASI, content, "Ana sayfa özetini güncelle", state.ozetSha);
    state.ozetSha = res.content.sha;
    statusEl.textContent = "Kaydedildi.";
    showToast("Özet güncellendi.");
  } catch (e) {
    statusEl.textContent = `Kaydedilemedi: ${e.message}`;
    showToast(`Özet kaydedilemedi: ${e.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- hakkında sayfası ---------- */

async function loadHakkinda() {
  const data = await ghGetFile(HAKKINDA_DOSYASI);
  if (data) {
    state.hakkindaSha = data.sha;
    const kayit = JSON.parse(base64ToUtf8(data.content));
    return { text: kayit.text || "", format: kayit.format || "markdown" };
  }
  state.hakkindaSha = null;
  return { text: "", format: "html" };
}

async function handleSaveHakkinda() {
  const editor = document.getElementById("f-hakkinda");
  const statusEl = document.getElementById("hakkinda-status");
  const btn = document.getElementById("hakkinda-save-btn");
  const text = sanitizeEditorHtml(editor.innerHTML).trim();

  btn.disabled = true;
  statusEl.textContent = "Kaydediliyor...";
  try {
    const content = utf8ToBase64(JSON.stringify({ text, format: "html" }, null, 2) + "\n");
    const res = await ghPutFile(HAKKINDA_DOSYASI, content, "Hakkında sayfasını güncelle", state.hakkindaSha);
    state.hakkindaSha = res.content.sha;
    statusEl.textContent = "Kaydedildi.";
    showToast("Hakkında sayfası güncellendi.");
  } catch (e) {
    statusEl.textContent = `Kaydedilemedi: ${e.message}`;
    showToast(`Hakkında kaydedilemedi: ${e.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

function kategoriPageTemplate(slug, label) {
  const safeLabel = escapeHtml(label);
  return `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="../favicon.svg">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <script>
      try {
        if (localStorage.getItem("yigitclub_theme") === "light") {
          document.documentElement.dataset.theme = "light";
        }
      } catch (e) {}
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="yigit.club">
    <title>${safeLabel} | yigit.club</title>
    <meta name="description" content="${safeLabel} kategorisindeki yazılar — yigit.club">
    <link rel="canonical" href="https://yigit.club/kategori/${slug}.html">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="yigit.club">
    <meta property="og:locale" content="tr_TR">
    <meta property="og:title" content="${safeLabel} — yigit.club">
    <meta property="og:description" content="${safeLabel} kategorisindeki yazılar — yigit.club">
    <meta property="og:url" content="https://yigit.club/kategori/${slug}.html">
    <meta property="og:image" content="https://yigit.club/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="alternate" type="application/rss+xml" title="yigit.club" href="/feed.xml">
    <link rel="stylesheet" href="../css/style.css?v=13">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,600&display=swap">
  </head>
  <body>

    <header>
      <a href="../index.html" class="logo" id="site-logo" aria-label="yigit.club">
        <span class="logo-bold"></span><span class="logo-italic"></span><span class="logo-cursor"></span>
      </a>
      <button id="menu-toggle" class="menu-toggle" aria-label="Menü">☰</button>
      <div class="header-right" id="header-right">
        <nav id="site-nav"></nav>
        <div class="nav-search">
          <input type="search" id="site-search" placeholder="Ara...">
          <div id="search-results" class="search-results"></div>
        </div>
        <button id="theme-toggle" class="theme-toggle" aria-label="Tema değiştir"></button>
      </div>
    </header>

    <h1 class="kategori-baslik" style="margin-bottom: 24px;">${safeLabel}</h1>

    <div class="grid" id="posts-grid" data-category="${escapeHtml(slug)}">
      <p style="color:#a1a1aa;">Yükleniyor...</p>
    </div>

    <footer>
      <p>yigit.club · <a href="../hakkinda.html">hakkında</a> · <a href="/feed.xml">RSS</a></p>
    </footer>

    <script src="../js/site.js?v=16"></script>
    <script>
      initTheme();
      initLogoTyping();
      initMobileMenu();
      renderNav("../", "");
      initSearch("../");
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
    showToast(`"${label}" kategorisi eklendi.`);
  } catch (e) {
    showToast(`Kategori eklenemedi: ${e.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

async function handleDeleteCategory() {
  const slug = document.getElementById("f-category").value;
  if (slug === "genel") {
    showToast("Genel kategorisi silinemez.", true);
    return;
  }
  const cat = state.categories.find((c) => c.slug === slug);
  if (!cat) return;

  const postsUsing = state.posts.filter((p) => p.category === slug).length;
  const warning = postsUsing > 0
    ? `"${cat.label}" kategorisini silmek istediğine emin misin? Bu kategoriyi kullanan ${postsUsing} yazı var; yazılar etkilenmeye devam edecek ama kategori sayfası kaldırılacak.`
    : `"${cat.label}" kategorisini kalıcı olarak silmek istediğine emin misin?`;
  if (!confirm(warning)) return;

  const btn = document.getElementById("delete-category-btn");
  btn.disabled = true;
  try {
    const newList = state.categories.filter((c) => c.slug !== slug);
    await saveCategories(newList);
    state.categories = newList;

    const pagePath = `kategori/${slug}.html`;
    const existing = await ghGetFile(pagePath);
    if (existing) {
      await ghDeleteFile(pagePath, existing.sha, `Kategori sayfası sil: ${slug}`);
    }

    refreshCategorySelect();
    document.getElementById("f-category").value = "genel";
    updatePhotoBlockVisibility();
    showToast(`"${cat.label}" kategorisi silindi.`);
  } catch (e) {
    showToast(`Kategori silinemedi: ${e.message}`, true);
  } finally {
    btn.disabled = false;
  }
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
      document.getElementById("photo-preview-label").style.display = "none";
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

  viewport.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    cropState.dragging = true;
    cropState.lastX = t.clientX;
    cropState.lastY = t.clientY;
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (!cropState.dragging) return;
    const t = e.touches[0];
    cropState.offsetX += t.clientX - cropState.lastX;
    cropState.offsetY += t.clientY - cropState.lastY;
    cropState.lastX = t.clientX;
    cropState.lastY = t.clientY;
    clampOffsets();
    applyCropTransform();
  }, { passive: true });
  window.addEventListener("touchend", () => { cropState.dragging = false; });

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
    const previewLabel = document.getElementById("photo-preview-label");
    previewLabel.textContent = "Yeni görsel (kaydedince yüklenecek):";
    previewLabel.style.display = "";
    document.getElementById("cropper-wrap").style.display = "none";
  });
}

function updatePhotoBlockVisibility() {
  const category = document.getElementById("f-category").value;
  document.getElementById("photo-block").style.display = category === "fotograf" ? "" : "none";
}

/* ---------- rich text temizleme ----------
   Başka bir yerden (Word, web sayfası, Notion) yapıştırılan metin beraberinde
   <span style>, <font>, class ve iç içe boş <p> yığını getiriyor; bu çöp
   JSON'a kaydolup sitenin tipografisini bozuyor. Hem yapıştırma anında hem de
   kayıt anında yalnızca izin verilen etiketler bırakılıyor. */

const IZINLI_ETIKETLER = new Set(["P", "BR", "STRONG", "EM", "U", "H2", "UL", "OL", "LI", "A", "BLOCKQUOTE", "CODE"]);
const ETIKET_ESLESMELERI = { B: "STRONG", I: "EM", H1: "H2", H3: "H2", H4: "H2", H5: "H2", H6: "H2" };
const BLOK_ETIKETLER = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "TABLE", "SECTION", "ARTICLE"]);

/* Tehlikeli şemaları engelle, geri kalanına izin ver.
   Önceden yalnızca http(s)/mailto/"/"/# kabul ediliyordu; bu yüzden site içi
   göreli bağlantılar (ör. post.html?slug=ilk-yazi) sessizce siliniyordu.
   Boşluk/kontrol karakteriyle gizlenmiş şemalar da yakalanır. */
function guvenliHref(value) {
  const ham = (value || "").trim();
  if (!ham) return null;
  const temiz = ham.replace(/\s/g, "").toLowerCase();
  if (/^(javascript|data|vbscript|file):/.test(temiz)) return null;
  return ham;
}

function disBaglantiMi(href) {
  return /^(https?:\/\/|mailto:)/i.test((href || "").trim());
}

function sanitizeEditorHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html || "";
  tpl.content
    .querySelectorAll("script,style,meta,link,title,noscript,iframe,object,embed,svg")
    .forEach((n) => n.remove());

  const temizle = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return; // metin düğümleri korunur

      temizle(node); // önce çocuklar normalleştirilsin

      let tag = node.tagName;

      // DIV: satır kutusuysa paragrafa çevir, kapsayıcıysa etiketi kaldır
      if (tag === "DIV") {
        const blokIceriyor = [...node.children].some((c) => BLOK_ETIKETLER.has(c.tagName));
        if (blokIceriyor) {
          node.replaceWith(...node.childNodes);
          return;
        }
        const p = document.createElement("p");
        p.append(...node.childNodes);
        node.replaceWith(p);
        node = p;
        tag = "P";
      }

      const esdeger = ETIKET_ESLESMELERI[tag];
      if (esdeger) {
        const yeni = document.createElement(esdeger.toLowerCase());
        yeni.append(...node.childNodes);
        node.replaceWith(yeni);
        node = yeni;
        tag = esdeger;
      }

      if (!IZINLI_ETIKETLER.has(tag)) {
        node.replaceWith(...node.childNodes); // etiketi at, metni koru
        return;
      }

      [...node.attributes].forEach((attr) => {
        const isHref = tag === "A" && attr.name.toLowerCase() === "href";
        if (isHref && guvenliHref(attr.value)) return;
        node.removeAttribute(attr.name);
      });

      // Yeni sekmede yalnızca dış bağlantılar açılır; site içi linkler aynı sekmede kalır.
      if (tag === "A" && disBaglantiMi(node.getAttribute("href"))) {
        node.setAttribute("rel", "noopener noreferrer");
        node.setAttribute("target", "_blank");
      }
    });
  };

  temizle(tpl.content);

  return tpl.innerHTML
    .replace(/&nbsp;/g, " ")
    .replace(/<p>(?:\s|<br\s*\/?>)*<\/p>/gi, (m) => (/<br/i.test(m) ? m : "")) // tamamen boş paragrafları at
    .replace(/\s+</g, (m) => (m.includes("\n") ? "<" : m))
    .trim();
}

function getBodyHtml() {
  return sanitizeEditorHtml(document.getElementById("f-body").innerHTML).trim();
}

function isBodyEmpty() {
  return !document.getElementById("f-body").textContent.trim();
}

function setBodyHtml(content, format) {
  const editor = document.getElementById("f-body");
  if (!content) {
    editor.innerHTML = "";
    return;
  }
  editor.innerHTML = format === "html" ? content : marked.parse(content);
}

function applyWysiwygFormat(type, editorId = "f-body") {
  const editor = document.getElementById(editorId);
  editor.focus();
  if (type === "bold") {
    document.execCommand("bold");
  } else if (type === "italic") {
    document.execCommand("italic");
  } else if (type === "h2") {
    document.execCommand("formatBlock", false, "h2");
  } else if (type === "link") {
    const url = prompt("Bağlantı adresi:", "https://");
    if (url) document.execCommand("createLink", false, url);
  } else if (type === "list") {
    document.execCommand("insertUnorderedList");
  }
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
      <div id="autosave-slot"></div>
      <div class="admin-columns-3">
        <section class="admin-col-meta">
          <h2 id="form-title">Yeni Yazı</h2>
          <form id="post-form" class="admin-form">
            <label for="f-title">Başlık</label>
            <input type="text" id="f-title" required>

            <div class="focus-hide">
              <label for="f-slug">Slug <span class="hint">dosya/URL adı</span></label>
              <input type="text" id="f-slug" class="slug-input" required>

              <label for="f-category">Ana Kategori</label>
              <div class="category-row">
                <select id="f-category">${categoryOptionsHtml("genel")}</select>
                <button type="button" id="add-category-btn" class="btn-secondary" title="Yeni kategori ekle">+</button>
                <button type="button" id="delete-category-btn" class="btn-danger" title="Seçili kategoriyi sil">−</button>
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
                <div class="datetime-wrap">
                  <div class="datetime-display" aria-hidden="true">
                    <span id="f-datetime-label"></span>
                    <span class="datetime-icon" aria-hidden="true">📅</span>
                  </div>
                  <input type="datetime-local" id="f-datetime" class="datetime-overlay-input">
                </div>
              </div>
            </div>
          </form>
        </section>

        <section class="admin-col-content">
          <div id="photo-block" class="photo-block focus-hide" style="display:none;">
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
            <p id="photo-preview-label" class="hint" style="display:none; margin-top:12px;">Mevcut görsel:</p>
            <img id="photo-preview" class="photo-preview" style="display:none;">
            <label for="f-image-caption">Görsel Açıklaması</label>
            <input type="text" id="f-image-caption">
          </div>

          <div id="f-body-row">
            <label style="margin-top:0;">İçerik</label>
            <div class="md-toolbar" id="body-toolbar">
              <button type="button" data-md="bold" title="Kalın"><strong>B</strong></button>
              <button type="button" data-md="italic" title="İtalik"><em>i</em></button>
              <button type="button" data-md="h2" title="Başlık">H2</button>
              <button type="button" data-md="link" title="Bağlantı">🔗</button>
              <button type="button" data-md="list" title="Liste">•</button>
            </div>
            <div id="f-body" class="body-wysiwyg" contenteditable="true" data-placeholder="İçeriğini yaz..."></div>
          </div>

          <p id="form-error" style="color:#f87171; min-height:18px;"></p>
        </section>

        <section class="admin-col-archive">
          <h2>Arşiv</h2>
          <div id="archive-root"><p style="color:#a1a1aa;">Yükleniyor...</p></div>

          <details class="admin-drafts-section">
            <summary><h2>Taslaklar</h2></summary>
            <div id="drafts-root"><p style="color:#a1a1aa;">Yükleniyor...</p></div>
          </details>

          <details class="admin-ozet-section">
            <summary><h2>Ana Sayfa Özeti</h2></summary>
            <p class="hint" style="margin-bottom:8px;">Ana sayfanın üstünde büyük yazıyla gösterilir. Biçimlendirmek için yazıyı seçip yukarıdaki düğmeleri kullan.</p>
            <div class="md-toolbar" id="ozet-toolbar">
              <button type="button" data-md="bold" title="Kalın"><strong>B</strong></button>
              <button type="button" data-md="italic" title="İtalik"><em>i</em></button>
              <button type="button" data-md="h2" title="Başlık">H2</button>
              <button type="button" data-md="link" title="Bağlantı">🔗</button>
              <button type="button" data-md="list" title="Liste">•</button>
            </div>
            <div id="f-ozet" class="body-wysiwyg ozet-wysiwyg" contenteditable="true" data-placeholder="Ana sayfada görünecek kısa tanıtım..."></div>
            <div class="admin-form-actions">
              <button type="button" id="ozet-save-btn">Özeti Kaydet</button>
              <span id="ozet-status" class="admin-post-meta"></span>
            </div>
          </details>

          <details class="admin-ozet-section">
            <summary><h2>Hakkında Sayfası</h2></summary>
            <p class="hint" style="margin-bottom:8px;">Hakkında sayfasının giriş bölümü. Alttaki "Kahve aşamaları" açıklaması sabittir.</p>
            <div class="md-toolbar" id="hakkinda-toolbar">
              <button type="button" data-md="bold" title="Kalın"><strong>B</strong></button>
              <button type="button" data-md="italic" title="İtalik"><em>i</em></button>
              <button type="button" data-md="h2" title="Başlık">H2</button>
              <button type="button" data-md="link" title="Bağlantı">🔗</button>
              <button type="button" data-md="list" title="Liste">•</button>
            </div>
            <div id="f-hakkinda" class="body-wysiwyg ozet-wysiwyg" contenteditable="true" data-placeholder="Hakkında sayfasında görünecek metin..."></div>
            <div class="admin-form-actions">
              <button type="button" id="hakkinda-save-btn">Hakkında'yı Kaydet</button>
              <span id="hakkinda-status" class="admin-post-meta"></span>
            </div>
          </details>
        </section>
      </div>
    </div>

    <div class="admin-actionbar">
      <div class="admin-actionbar-inner">
        <div class="admin-actionbar-left">
          <button type="submit" form="post-form" id="submit-btn">Yayınla</button>
          <button type="button" id="draft-save-btn" class="btn-secondary">Taslak Kaydet</button>
          <button type="button" id="cancel-edit-btn" style="display:none;" class="btn-secondary">İptal</button>
        </div>
        <button type="button" id="focus-mode-btn" class="btn-secondary" title="Odak Modu" aria-label="Odak Modu">🧘</button>
        <button id="logout-btn">Çıkış Yap</button>
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
        <button type="button" class="btn-secondary" data-action="add-entry" data-slug="${escapeHtml(p.slug)}">Ekle</button>
        <button type="button" data-action="edit-meta" data-slug="${escapeHtml(p.slug)}" class="btn-secondary">Künyeyi Güncelle</button>
        <button type="button" data-action="delete-post" data-slug="${escapeHtml(p.slug)}" data-sha="${escapeHtml(p.sha)}" class="btn-danger">Tümünü Sil</button>
      </div>
      <div class="archive-entries">
        ${entries
          .map(
            (e) => `
          <div class="archive-entry">
            <span class="admin-post-meta">${escapeHtml(formatDateTimeAdmin(e.date))}</span>
            <div class="archive-entry-actions">
              <button type="button" data-action="edit-entry" data-slug="${escapeHtml(p.slug)}" data-index="${e.idx}">Düzenle</button>
              <button type="button" class="btn-danger" data-action="delete-entry" data-slug="${escapeHtml(p.slug)}" data-index="${e.idx}">Sil</button>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function draftsHTML() {
  if (state.draftsRepoHazir === false) {
    return `
      <div class="draft-kurulum">
        <p><strong>Taslaklar için gizli depo gerekiyor.</strong></p>
        <p>Yayınlanmamış yazıların herkese açık olmaması için taslaklar ayrı ve
        <em>private</em> bir depoda tutuluyor. Henüz erişilemiyor.</p>
        <ol>
          <li>GitHub'da <code>${escapeHtml(DRAFTS_REPO.split("/")[1])}</code> adıyla
              <strong>private</strong> bir depo oluştur (README ekleyerek).</li>
          <li>Token'ın bu depoya da erişebildiğinden emin ol.</li>
          <li>Bu sayfayı yenile.</li>
        </ol>
        <p class="hint">O zamana kadar yayınlama ve diğer her şey normal çalışır.</p>
      </div>
    `;
  }
  if (state.drafts.length === 0) {
    return '<p style="color:#a1a1aa;">Taslak yok.</p>';
  }
  return state.drafts
    .map(
      (d) => `
    <div class="draft-item">
      <div class="draft-item-info">
        <span class="admin-post-title">${escapeHtml(d.title || "(başlıksız)")}</span>
        <span class="admin-post-meta">${escapeHtml(d.category || "genel")}</span>
      </div>
      <div class="draft-item-actions">
        <button type="button" data-action="edit-draft" data-slug="${escapeHtml(d.slug)}">Düzenle</button>
        <button type="button" class="btn-danger" data-action="delete-draft" data-slug="${escapeHtml(d.slug)}" data-sha="${escapeHtml(d.sha)}">Sil</button>
      </div>
    </div>
  `
    )
    .join("");
}

function renderDrafts() {
  document.getElementById("drafts-root").innerHTML = draftsHTML();
}

function onDraftsClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, slug, sha } = btn.dataset;
  if (action === "edit-draft") {
    startEditDraft(slug);
  } else if (action === "delete-draft") {
    handleDeleteDraft(slug, sha);
  }
}

async function loadDrafts() {
  try {
    const files = (await ghListFolder(DRAFTS_FOLDER, DRAFTS_REPO)).filter((f) => f.name.endsWith(".json"));

    if (files.length === 0) {
      // Boş liste "henüz taslak yok" da olabilir, "depo yok/erişilemiyor" da.
      state.draftsRepoHazir = await ghDepoErisilebilirMi(DRAFTS_REPO);
      state.drafts = [];
      return;
    }

    // Gizli depoda download_url kimlik doğrulama istediği için içerik API'den okunur.
    const drafts = await Promise.all(
      files.map(async (f) => {
        const dosya = await ghGetFile(`${DRAFTS_FOLDER}/${f.name}`, DRAFTS_REPO);
        const data = JSON.parse(base64ToUtf8(dosya.content));
        return { ...data, slug: f.name.replace(/\.json$/, ""), sha: dosya.sha };
      })
    );
    drafts.sort((a, b) => new Date(b.date) - new Date(a.date));
    state.drafts = drafts;
    state.draftsRepoHazir = true;
  } catch (e) {
    state.drafts = [];
    state.draftsRepoHazir = false;
  }
}

async function handleSaveDraft() {
  const title = document.getElementById("f-title").value.trim();
  let slug = document.getElementById("f-slug").value.trim();
  if (!title || !slug) {
    showToast("Taslak için başlık ve slug gerekli.", true);
    return;
  }
  slug = slugify(slug);
  const category = document.getElementById("f-category").value;
  const subcategory = document.getElementById("f-subcategory").value.trim();
  const stage = document.getElementById("f-stage").value;
  const body = getBodyHtml();
  const datetimeLocal = document.getElementById("f-datetime").value;
  const isoDatetime = datetimeLocal ? new Date(datetimeLocal).toISOString() : new Date().toISOString();
  const imageCaption = document.getElementById("f-image-caption").value.trim();

  const draftBtn = document.getElementById("draft-save-btn");
  draftBtn.disabled = true;
  const originalLabel = draftBtn.textContent;
  draftBtn.textContent = "Kaydediliyor...";

  try {
    let image = (uiState.targetPost && uiState.targetPost.image) || "";
    if (category === "fotograf") {
      const fileInput = document.getElementById("f-photo-file");
      if (!state.croppedBlob && fileInput.files[0] && cropState.img) {
        state.croppedBlob = await cropToBlob();
      }
    }

    /* Taslaktaki görsel açık depoya yüklenmez; yayınlanana kadar taslağın
       kendi içinde (gizli depoda) base64 olarak durur. Yükleme yalnızca
       yayınlama anında, onPostSubmit içinde yapılır. */
    let imageData = "";
    if (category === "fotograf" && state.croppedBlob) {
      imageData = await fileToBase64(state.croppedBlob);
    }

    const path = `${DRAFTS_FOLDER}/${slug}.json`;
    const sha = uiState.draftSlug === slug ? uiState.draftSha : (await ghGetFile(path, DRAFTS_REPO))?.sha;
    const draft = { title, date: isoDatetime, category, subcategory, stage, image, imageCaption, body, bodyFormat: "html", imageData };
    const content = utf8ToBase64(JSON.stringify(draft, null, 2) + "\n");
    const res = await ghPutFile(path, content, `Taslak kaydet: ${slug}`, sha, DRAFTS_REPO);

    uiState.draftSlug = slug;
    uiState.draftSha = res.content.sha;

    await loadDrafts();
    renderDrafts();
    clearAutosave();
    showToast("Taslak kaydedildi.");
  } catch (err) {
    showToast(err.message, true);
  } finally {
    draftBtn.disabled = false;
    draftBtn.textContent = originalLabel;
  }
}

function startEditDraft(slug) {
  const d = state.drafts.find((x) => x.slug === slug);
  if (!d) return;

  uiState.mode = "new-post";
  uiState.targetSlug = null;
  uiState.targetSha = null;
  uiState.targetPost = null;
  uiState.editingEntryIndex = null;
  uiState.slugTouched = true;
  uiState.draftSlug = d.slug;
  uiState.draftSha = d.sha;

  document.getElementById("f-title").value = d.title || "";
  document.getElementById("f-title").disabled = false;
  document.getElementById("f-slug").value = d.slug;
  document.getElementById("f-slug").disabled = false;
  refreshCategorySelect();
  document.getElementById("f-category").value = d.category || "genel";
  document.getElementById("f-category").disabled = false;
  document.getElementById("f-subcategory").value = d.subcategory || "";
  document.getElementById("f-subcategory").disabled = false;
  document.getElementById("f-stage").value = d.stage || "🫘 Çekirdek";
  document.getElementById("f-stage").disabled = false;
  document.getElementById("f-image-caption").value = d.imageCaption || "";
  document.getElementById("f-datetime-row").style.display = "";
  document.getElementById("f-body-row").style.display = "";
  setDatetimeValue(d.date ? new Date(d.date) : new Date());
  setBodyHtml(d.body, d.bodyFormat);
  document.getElementById("cropper-wrap").style.display = "none";
  document.getElementById("f-photo-file").value = "";
  state.croppedBlob = null;

  const preview = document.getElementById("photo-preview");
  const previewLabel = document.getElementById("photo-preview-label");
  if (d.imageData) {
    // Taslağın içinde saklanan görsel; yayınlanınca açık depoya yüklenecek.
    state.croppedBlob = base64ToBlob(d.imageData);
    preview.src = `data:image/jpeg;base64,${d.imageData}`;
    preview.style.display = "";
    previewLabel.textContent = "Taslaktaki görsel (yayınlanınca yüklenecek):";
    previewLabel.style.display = "";
  } else if (d.image) {
    preview.src = `../${d.image}`;
    preview.style.display = "";
    previewLabel.textContent = "Mevcut görsel:";
    previewLabel.style.display = "";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
    previewLabel.style.display = "none";
  }
  updatePhotoBlockVisibility();

  document.getElementById("form-title").textContent = `Taslak: ${d.title}`;
  document.getElementById("submit-btn").textContent = "Yayınla";
  document.getElementById("cancel-edit-btn").style.display = "";
  document.getElementById("draft-save-btn").style.display = "";
  document.getElementById("form-error").textContent = "";
  document.getElementById("post-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleDeleteDraft(slug, sha) {
  if (!confirm(`"${slug}" taslağını kalıcı olarak silmek istediğine emin misin?`)) return;
  try {
    await ghDeleteFile(`${DRAFTS_FOLDER}/${slug}.json`, sha, `Taslak sil: ${slug}`, DRAFTS_REPO);
    if (uiState.draftSlug === slug) {
      uiState.draftSlug = null;
      uiState.draftSha = null;
    }
    await loadDrafts();
    renderDrafts();
    showToast("Taslak silindi.");
  } catch (e) {
    showToast(`Silinemedi: ${e.message}`, true);
  }
}

function renderArchive() {
  document.getElementById("archive-root").innerHTML = archiveHTML();
}

function toggleFocusMode() {
  const dashboard = document.querySelector(".admin-dashboard");
  const btn = document.getElementById("focus-mode-btn");
  const isActive = dashboard.classList.toggle("focus-mode");
  btn.classList.toggle("active", isActive);
}

/* ---------- form modları ---------- */

function resetForm() {
  uiState.mode = "new-post";
  uiState.targetSlug = null;
  uiState.targetSha = null;
  uiState.targetPost = null;
  uiState.slugTouched = false;
  uiState.editingEntryIndex = null;
  uiState.draftSlug = null;
  uiState.draftSha = null;
  state.croppedBlob = null;

  const form = document.getElementById("post-form");
  form.reset();

  ["f-title", "f-slug", "f-category", "f-subcategory", "f-stage"].forEach((id) => {
    document.getElementById(id).disabled = false;
  });
  document.getElementById("f-datetime-row").style.display = "";
  document.getElementById("f-body-row").style.display = "";
  setDatetimeValue(new Date());
  document.getElementById("f-image-caption").value = "";
  document.getElementById("photo-preview").style.display = "none";
  document.getElementById("photo-preview-label").style.display = "none";
  document.getElementById("cropper-wrap").style.display = "none";
  document.getElementById("f-photo-file").value = "";
  document.getElementById("form-title").textContent = "Yeni Yazı";
  document.getElementById("submit-btn").textContent = "Yayınla";
  document.getElementById("cancel-edit-btn").style.display = "none";
  document.getElementById("draft-save-btn").style.display = "";
  document.getElementById("form-error").textContent = "";
  document.getElementById("f-body").innerHTML = "";
  clearAutosave();
  updatePhotoBlockVisibility();
}

function toLocalDatetimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function updateDatetimeDisplay() {
  const input = document.getElementById("f-datetime");
  const label = document.getElementById("f-datetime-label");
  if (!input.value) {
    label.textContent = "";
    return;
  }
  label.textContent = new Date(input.value).toLocaleString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setDatetimeValue(date) {
  document.getElementById("f-datetime").value = toLocalDatetimeValue(date);
  updateDatetimeDisplay();
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
  setDatetimeValue(new Date());
  document.getElementById("cropper-wrap").style.display = "none";
  document.getElementById("f-photo-file").value = "";
  state.croppedBlob = null;

  const preview = document.getElementById("photo-preview");
  const previewLabel = document.getElementById("photo-preview-label");
  if (p.image) {
    preview.src = `../${p.image}`;
    preview.style.display = "";
    previewLabel.textContent = "Mevcut görsel:";
    previewLabel.style.display = "";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
    previewLabel.style.display = "none";
  }

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
  document.getElementById("f-body").innerHTML = "";
  document.getElementById("form-title").textContent = `Yeni Girdi: ${p.title}`;
  document.getElementById("submit-btn").textContent = "Girdi Ekle";
  document.getElementById("cancel-edit-btn").style.display = "";
  document.getElementById("draft-save-btn").style.display = "none";
  document.getElementById("post-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEditEntry(slug, index) {
  const p = state.posts.find((x) => x.slug === slug);
  if (!p) return;
  const entry = (p.entries || [])[index];
  if (!entry) return;
  uiState.mode = "edit-entry";
  uiState.targetSlug = slug;
  uiState.targetSha = p.sha;
  uiState.targetPost = p;
  uiState.editingEntryIndex = index;
  fillMetaFields(p);
  setBodyHtml(entry.body, entry.bodyFormat);
  setDatetimeValue(new Date(entry.date));
  document.getElementById("form-title").textContent = `Girdiyi Düzenle: ${p.title}`;
  document.getElementById("submit-btn").textContent = "Girdiyi Güncelle";
  document.getElementById("cancel-edit-btn").style.display = "";
  document.getElementById("draft-save-btn").style.display = "none";
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
  document.getElementById("draft-save-btn").style.display = "none";
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
    await rebuildIndexSafely();
    renderArchive();
    showToast("Yazı silindi.");
  } catch (e) {
    showToast(`Silinemedi: ${e.message}`, true);
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
    await rebuildIndexSafely();
    renderArchive();
    showToast("Girdi silindi.");
  } catch (e) {
    showToast(`Girdi silinemedi: ${e.message}`, true);
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
  } else if (action === "edit-entry") {
    startEditEntry(slug, parseInt(btn.dataset.index, 10));
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
  const body = getBodyHtml();
  const datetimeLocal = document.getElementById("f-datetime").value;
  const isoDatetime = datetimeLocal ? new Date(datetimeLocal).toISOString() : new Date().toISOString();
  const imageCaption = document.getElementById("f-image-caption").value.trim();

  if (!title || !slug) {
    errorEl.textContent = "Başlık ve slug zorunlu.";
    return;
  }
  if (uiState.mode !== "edit-meta" && isBodyEmpty()) {
    errorEl.textContent = "İçerik boş olamaz.";
    return;
  }
  slug = slugify(slug);

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "Kaydediliyor...";

  try {
    let image = (uiState.targetPost && uiState.targetPost.image) || "";

    if (category === "fotograf") {
      const fileInput = document.getElementById("f-photo-file");
      if (!state.croppedBlob && fileInput.files[0] && cropState.img) {
        state.croppedBlob = await cropToBlob();
      }
      if (state.croppedBlob) {
        const file = new File([state.croppedBlob], `${slug}.jpg`, { type: "image/jpeg" });
        image = await uploadImage(file);
      } else if (!image && uiState.mode === "new-post") {
        throw new Error("Fotoğraf kategorisi için bir görsel seçip kırpmalısın.");
      }
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
      post = { title, date: isoDatetime, category, subcategory, stage, image, imageCaption, entries: [{ date: isoDatetime, body, bodyFormat: "html" }] };
    } else if (uiState.mode === "add-entry") {
      const target = uiState.targetPost;
      path = `${POSTS_FOLDER}/${target.slug}.json`;
      sha = uiState.targetSha;
      post = { ...target, entries: [...(target.entries || []), { date: isoDatetime, body, bodyFormat: "html" }] };
      delete post.slug;
      delete post.sha;
    } else if (uiState.mode === "edit-entry") {
      const target = uiState.targetPost;
      path = `${POSTS_FOLDER}/${target.slug}.json`;
      sha = uiState.targetSha;
      const updatedEntries = [...(target.entries || [])];
      updatedEntries[uiState.editingEntryIndex] = { date: isoDatetime, body, bodyFormat: "html" };
      post = { ...target, image, entries: updatedEntries };
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
    const message = {
      "new-post": `Yeni yazı: ${slug}`,
      "add-entry": `Yeni girdi: ${slug}`,
      "edit-entry": `Girdi güncelle: ${slug}`,
      "edit-meta": `Bilgi güncelle: ${slug}`,
    }[uiState.mode];
    await ghPutFile(path, content, message, sha);

    if (uiState.mode === "new-post" && uiState.draftSlug) {
      try {
        await ghDeleteFile(`${DRAFTS_FOLDER}/${uiState.draftSlug}.json`, uiState.draftSha, `Taslak silindi (yayınlandı): ${uiState.draftSlug}`, DRAFTS_REPO);
      } catch (e) {
        /* taslak temizliği başarısız olsa da yayın işlemi tamamlandı */
      }
    }

    const successMessage = {
      "new-post": "Yazı yayınlandı.",
      "add-entry": "Girdi eklendi.",
      "edit-entry": "Girdi güncellendi.",
      "edit-meta": "Bilgiler güncellendi.",
    }[uiState.mode];

    resetForm();
    await loadPosts();
    await rebuildIndexSafely();
    renderArchive();
    await loadDrafts();
    renderDrafts();
    showToast(successMessage);
  } catch (err) {
    errorEl.textContent = err.message;
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

/* ---------- yazı listesi ---------- */

async function loadPosts() {
  try {
    const files = (await ghListFolder(POSTS_FOLDER)).filter(
      (f) => f.name.endsWith(".json") && f.name !== INDEX_FILENAME && f.name !== SEARCH_FILENAME
    );
    const posts = await Promise.all(
      files.map(async (f) => {
        const res = await fetch(`${f.download_url}?t=${Date.now()}`);
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

/* ---------- otomatik kaydetme ----------
   Uzun bir girdi yazarken sekme kapanırsa / sayfa yenilenirse içerik kaybolmasın.
   Yazılanlar tarayıcıda saklanır; panel yeniden açıldığında geri yükleme önerilir.
   Başarılı yayın/taslak kaydı ve formun temizlenmesi bu kaydı siler. */

const AUTOSAVE_KEY = "yigitclub_admin_autosave";
let __autosaveTimer = null;

function autosaveAnliktGoruntu() {
  const v = (id) => (document.getElementById(id) || {}).value || "";
  return {
    zaman: Date.now(),
    mode: uiState.mode,
    targetSlug: uiState.targetSlug,
    editingEntryIndex: uiState.editingEntryIndex,
    draftSlug: uiState.draftSlug,
    title: v("f-title"),
    slug: v("f-slug"),
    category: v("f-category"),
    subcategory: v("f-subcategory"),
    stage: v("f-stage"),
    datetime: v("f-datetime"),
    imageCaption: v("f-image-caption"),
    body: (document.getElementById("f-body") || {}).innerHTML || "",
  };
}

function autosaveDoluMu(s) {
  if (!s) return false;
  const govde = (s.body || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return Boolean((s.title || "").trim() || govde);
}

function scheduleAutosave() {
  clearTimeout(__autosaveTimer);
  __autosaveTimer = setTimeout(() => {
    try {
      const anlik = autosaveAnliktGoruntu();
      if (autosaveDoluMu(anlik)) localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(anlik));
      else localStorage.removeItem(AUTOSAVE_KEY);
    } catch (e) {
      /* depolama kotası dolabilir; otomatik kayıt kritik değil */
    }
  }, 700);
}

function clearAutosave() {
  clearTimeout(__autosaveTimer);
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (e) {}
  const bar = document.getElementById("autosave-bar");
  if (bar) bar.remove();
}

function autosaveGeriYukle(s) {
  const varOlanYazi = s.targetSlug && state.posts.some((p) => p.slug === s.targetSlug);
  const varOlanTaslak = s.draftSlug && state.drafts.some((d) => d.slug === s.draftSlug);

  if (s.mode === "add-entry" && varOlanYazi) startAddEntry(s.targetSlug);
  else if (s.mode === "edit-entry" && varOlanYazi) startEditEntry(s.targetSlug, s.editingEntryIndex);
  else if (s.mode === "edit-meta" && varOlanYazi) startEditMeta(s.targetSlug);
  else if (varOlanTaslak) startEditDraft(s.draftSlug);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  };
  set("f-title", s.title);
  set("f-slug", s.slug);
  set("f-category", s.category);
  set("f-subcategory", s.subcategory);
  set("f-stage", s.stage);
  set("f-image-caption", s.imageCaption);
  if (s.datetime) {
    document.getElementById("f-datetime").value = s.datetime;
    updateDatetimeDisplay();
  }
  if (s.body) document.getElementById("f-body").innerHTML = s.body;
  if (s.slug) uiState.slugTouched = true;
  updatePhotoBlockVisibility();
  clearAutosave();
  showToast("Kaydedilmemiş içerik geri yüklendi.");
}

function autosaveTeklifiGoster() {
  let anlik = null;
  try {
    anlik = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null");
  } catch (e) {
    return;
  }
  if (!autosaveDoluMu(anlik)) return;

  const slot = document.getElementById("autosave-slot");
  if (!slot) return;

  const baslik = (anlik.title || "").trim() || "(başlıksız)";
  const zaman = new Date(anlik.zaman).toLocaleString("tr-TR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  slot.innerHTML = `
    <div id="autosave-bar" class="autosave-bar">
      <span>Kaydedilmemiş içerik bulundu — <strong>${escapeHtml(baslik)}</strong> · ${escapeHtml(zaman)}</span>
      <div class="autosave-bar-actions">
        <button type="button" id="autosave-restore">Geri Yükle</button>
        <button type="button" id="autosave-discard" class="btn-secondary">Yoksay</button>
      </div>
    </div>
  `;
  document.getElementById("autosave-restore").addEventListener("click", () => autosaveGeriYukle(anlik));
  document.getElementById("autosave-discard").addEventListener("click", clearAutosave);
}

/* ---------- yazı dizini (manifest) ----------
   Site, yazı listesini GitHub API'si yerine bu tek dosyadan okur.
   Böylece ziyaretçi tarafında API limiti (60 istek/saat/IP) devreye girmez
   ve sayfa tek istekle açılır. Yazı değiştiren her işlemden sonra yenilenir. */

function plainTextFromEntry(entry) {
  const raw = entry.body || "";
  if (entry.bodyFormat === "html") {
    const div = document.createElement("div");
    // textContent blok sınırlarında boşluk bırakmadığı için önce ayırıcı ekle
    div.innerHTML = raw
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|blockquote|ul|ol)>/gi, " ");
    return (div.textContent || "").replace(/\s+/g, " ").trim();
  }
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")
    .replace(/[*_`>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Kart dizini yalın tutulur: her sayfa yüklemesinde indiği için yazı metinlerini
   buraya koymak dosyayı zamanla şişirirdi. Arama metni ayrı dosyada ve yalnızca
   kullanıcı arama kutusuna yazdığında indiriliyor. */
function buildIndexPayload() {
  return state.posts
    .map((p) => ({
      slug: p.slug,
      title: p.title || "",
      date: p.date || "",
      category: p.category || "genel",
      subcategory: p.subcategory || "",
      stage: p.stage || "",
      image: p.image || "",
      imageCaption: p.imageCaption || "",
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function buildSearchPayload() {
  return state.posts
    .map((p) => ({
      slug: p.slug,
      text: (p.entries || []).map(plainTextFromEntry).join(" ").trim(),
    }))
    .filter((p) => p.text);
}

const SITE_URL = "https://yigit.club";
const SITE_ACIKLAMA = "Yiğit'in dijital kafesi: kültürel miras üzerine düşünceler, koşu ve atölye projeleri.";

function xmlKacis(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFeedXml(index, metinler = {}) {
  const items = index
    .slice(0, 30)
    .map((p) => {
      const url = `${SITE_URL}/post.html?slug=${encodeURIComponent(p.slug)}`;
      const tarih = p.date ? new Date(p.date).toUTCString() : new Date().toUTCString();
      const ozet = p.imageCaption || (metinler[p.slug] || "").slice(0, 300);
      return `    <item>
      <title>${xmlKacis(p.title)}</title>
      <link>${xmlKacis(url)}</link>
      <guid isPermaLink="true">${xmlKacis(url)}</guid>
      <pubDate>${tarih}</pubDate>
      <category>${xmlKacis(p.category)}</category>
      <description>${xmlKacis(ozet)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>yigit.club</title>
    <link>${SITE_URL}/</link>
    <description>${xmlKacis(SITE_ACIKLAMA)}</description>
    <language>tr</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function buildSitemapXml(index) {
  const guncel = (d) => (d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const enYeni = index.length ? guncel(index[0].date) : guncel(null);

  const girdiler = [
    { loc: `${SITE_URL}/`, lastmod: enYeni },
    { loc: `${SITE_URL}/hakkinda.html`, lastmod: enYeni },
    ...state.categories.map((c) => ({
      loc: `${SITE_URL}/kategori/${encodeURIComponent(c.slug)}.html`,
      lastmod: enYeni,
    })),
    ...index.map((p) => ({
      loc: `${SITE_URL}/post.html?slug=${encodeURIComponent(p.slug)}`,
      lastmod: guncel(p.date),
    })),
  ];

  const urls = girdiler
    .map((u) => `  <url>\n    <loc>${xmlKacis(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function ghYaz(path, metin, mesaj) {
  const existing = await ghGetFile(path);
  await ghPutFile(path, utf8ToBase64(metin), mesaj, existing?.sha);
}

async function rebuildIndex() {
  const index = buildIndexPayload();
  const arama = buildSearchPayload();
  const metinler = Object.fromEntries(arama.map((p) => [p.slug, p.text]));

  await ghYaz(`${POSTS_FOLDER}/${INDEX_FILENAME}`, JSON.stringify(index, null, 2) + "\n", "Yazı dizinini güncelle");
  await ghYaz(`${POSTS_FOLDER}/${SEARCH_FILENAME}`, JSON.stringify(arama, null, 2) + "\n", "Arama dizinini güncelle");
  await ghYaz("feed.xml", buildFeedXml(index, metinler), "RSS beslemesini güncelle");
  await ghYaz("sitemap.xml", buildSitemapXml(index), "Site haritasını güncelle");
}

/* Bu dosyalar yazılamazsa asıl işlem (yayın/silme) yine de tamamlanmış sayılır;
   kullanıcıya yalnızca uyarı gösterilir. */
async function rebuildIndexSafely() {
  try {
    await rebuildIndex();
  } catch (e) {
    showToast(`Site dosyaları güncellenemedi: ${e.message}`, true);
  }
}

/* ---------- kurulum ---------- */

function syncActionbarSpacing() {
  const bar = document.querySelector(".admin-actionbar");
  if (!bar) return;
  document.body.style.paddingBottom = `${bar.offsetHeight + 24}px`;
}

function wireDashboard() {
  const actionbar = document.querySelector(".admin-actionbar");
  if (actionbar && window.ResizeObserver) {
    new ResizeObserver(syncActionbarSpacing).observe(actionbar);
  }
  syncActionbarSpacing();

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
  document.getElementById("delete-category-btn").addEventListener("click", handleDeleteCategory);

  // Her araç çubuğu kendi düzenleyicisine bağlanır
  [
    ["#body-toolbar", "f-body"],
    ["#ozet-toolbar", "f-ozet"],
    ["#hakkinda-toolbar", "f-hakkinda"],
  ].forEach(([toolbar, editorId]) => {
    document.querySelectorAll(`${toolbar} button`).forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => applyWysiwygFormat(btn.dataset.md, editorId));
    });
  });
  document.execCommand("defaultParagraphSeparator", false, "p");

  ["f-title", "f-slug", "f-category", "f-subcategory", "f-stage", "f-image-caption"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("input", scheduleAutosave);
    el.addEventListener("change", scheduleAutosave);
  });
  document.getElementById("f-body").addEventListener("input", scheduleAutosave);
  document.getElementById("f-datetime").addEventListener("input", scheduleAutosave);

  // Yapıştırma temizliği tüm zengin metin alanları için geçerli
  ["f-body", "f-ozet", "f-hakkinda"].forEach((id) => {
    document.getElementById(id).addEventListener("paste", (e) => {
      e.preventDefault();
      const pano = e.clipboardData;
      const html = pano.getData("text/html");
      const duzMetin = pano.getData("text/plain");
      const icerik = html
        ? sanitizeEditorHtml(html)
        : escapeHtml(duzMetin).replace(/\r?\n/g, "<br>");
      document.execCommand("insertHTML", false, icerik);
    });
  });

  document.getElementById("hakkinda-save-btn").addEventListener("click", handleSaveHakkinda);

  wireCropper();

  document.getElementById("ozet-save-btn").addEventListener("click", handleSaveOzet);

  document.getElementById("cancel-edit-btn").addEventListener("click", resetForm);
  document.getElementById("post-form").addEventListener("submit", onPostSubmit);
  document.getElementById("archive-root").addEventListener("click", onArchiveClick);
  document.getElementById("draft-save-btn").addEventListener("click", handleSaveDraft);
  document.getElementById("drafts-root").addEventListener("click", onDraftsClick);
  document.getElementById("focus-mode-btn").addEventListener("click", toggleFocusMode);
  document.getElementById("f-datetime").addEventListener("input", updateDatetimeDisplay);
  document.getElementById("f-datetime").addEventListener("click", (e) => {
    if (e.target.showPicker) {
      try {
        e.target.showPicker();
      } catch (err) {
        /* bazı tarayıcılar reddedebilir; bu durumda tarayıcının varsayılan davranışı geçerli olur */
      }
    }
  });
  setDatetimeValue(new Date());
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

  try {
    const ozet = await loadOzet();
    document.getElementById("f-ozet").innerHTML =
      ozet.format === "html" ? ozet.text : marked.parse(ozet.text || "");
    const hakkinda = await loadHakkinda();
    document.getElementById("f-hakkinda").innerHTML =
      hakkinda.format === "html" ? hakkinda.text : marked.parse(hakkinda.text || "");
  } catch (e) {
    document.getElementById("ozet-status").textContent = "Özet yüklenemedi.";
  }

  await loadPosts();
  renderArchive();
  await loadDrafts();
  renderDrafts();
  autosaveTeklifiGoster();
}

function initAdmin() {
  renderRoot();
}
