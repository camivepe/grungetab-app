/* ── GrungeTab · app.js ── */

// ── Configuración ─────────────────────────────────────────────────────────────
const CONFIG = window.GRUNGETAB_CONFIG || {};

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
].join(' ');

// ── Tamaños de fuente ─────────────────────────────────────────────────────────
const FONT_SIZES   = { 1: 0.78, 2: 0.88, 3: 1.05, 4: 1.25 };
const FONT_LABELS  = { 1: 'S',  2: 'M',  3: 'L',  4: 'XL' };

// ── Estado global ─────────────────────────────────────────────────────────────
const state = {
  // Auth
  accessToken: null,

  // Lector
  playing: false,
  speed: 2,
  theme: 'dark',
  hideTimer: null,
  rafId: null,
  lastTimestamp: null,
  scrollAccum: 0,

  // Visualización
  fontSize: 2,   // 1–4
  noWrap: false, // false = soft-wrap, true = sin ajuste (scroll horizontal)

  // Navegación de carpetas
  allItems: [],
  folderStack: [], // [{id, name}]
};

// ── Velocidades ───────────────────────────────────────────────────────────────
const SPEED_LABELS = { 1: 'Lento', 2: 'Normal', 3: 'Rápido', 4: 'Muy rápido' };
const SPEEDS       = { 1: 8, 2: 22, 3: 40, 4: 80 };

function pxPerSecond(level) {
  return SPEEDS[level] ?? 22;
}

// ── Referencias DOM ───────────────────────────────────────────────────────────
const screenLogin  = document.getElementById('screen-login');
const screenList   = document.getElementById('screen-list');
const screenReader = document.getElementById('screen-reader');

const docList      = document.getElementById('doc-list');
const listTitle    = document.getElementById('list-title');
const searchInput  = document.getElementById('search-input');
const btnListBack  = document.getElementById('btn-list-back');

const container    = document.getElementById('tab-container');
const tabContent   = document.getElementById('tab-content');
const controls     = document.getElementById('controls');
const btnPlay      = document.getElementById('btn-play');
const btnTop       = document.getElementById('btn-top');
const btnBack      = document.getElementById('btn-back');
const btnTheme     = document.getElementById('btn-theme');
const btnListTheme = document.getElementById('btn-list-theme');
const btnLogout    = document.getElementById('btn-logout');
const speedSlider  = document.getElementById('speed-slider');
const speedLabel   = document.getElementById('speed-label');
const songTitle    = document.getElementById('song-title');
const fontSlider   = document.getElementById('font-slider');
const fontLabel    = document.getElementById('font-label');
const btnWrap      = document.getElementById('btn-wrap');

// ── Navegación entre pantallas ────────────────────────────────────────────────
function showScreen(name) {
  screenLogin.classList.add('hidden');
  screenList.classList.add('hidden');
  screenReader.classList.add('hidden');

  if (name === 'login')  screenLogin.classList.remove('hidden');
  if (name === 'list')   screenList.classList.remove('hidden');
  if (name === 'reader') screenReader.classList.remove('hidden');
}

// ── Tema ──────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  document.body.classList.toggle('dark',  theme === 'dark');
  document.body.classList.toggle('light', theme === 'light');
  const icon = theme === 'dark' ? '☀️' : '🌙';
  btnTheme.textContent     = icon;
  btnListTheme.textContent = icon;
  localStorage.setItem('grungetab-theme', theme);
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function loadTheme() {
  applyTheme(localStorage.getItem('grungetab-theme') || 'dark');
}

// ── Visualización: fuente y ajuste de línea ───────────────────────────────────
function applyFontSize(level) {
  state.fontSize = level;
  tabContent.style.setProperty('--doc-font-size', FONT_SIZES[level] + 'rem');
  fontSlider.value = level;
  fontLabel.textContent = FONT_LABELS[level];
  localStorage.setItem('grungetab-fontsize', level);
}

function applyWrap(noWrap) {
  state.noWrap = noWrap;
  tabContent.classList.toggle('no-wrap', noWrap);
  btnWrap.classList.toggle('active', noWrap);
  btnWrap.title = noWrap ? 'Activar ajuste de línea' : 'Desactivar ajuste de línea';
  localStorage.setItem('grungetab-nowrap', noWrap ? '1' : '0');
}

function loadViewPrefs() {
  const size = parseInt(localStorage.getItem('grungetab-fontsize'), 10);
  applyFontSize(size >= 1 && size <= 4 ? size : 2);
  applyWrap(localStorage.getItem('grungetab-nowrap') === '1');
}

// ── Auth: Google Identity Services ────────────────────────────────────────────
window.onGoogleLogin = function(response) {
  // Verificar que el email del token coincida con el autorizado
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    if (payload.email !== CONFIG.allowedEmail) {
      showLoginError('Acceso no autorizado.');
      return;
    }
  } catch (e) {
    showLoginError('Error de autenticación.');
    return;
  }
  initOAuthClient();
};

function showLoginError(msg) {
  const existing = document.getElementById('login-error');
  if (existing) existing.remove();
  const el = document.createElement('p');
  el.id = 'login-error';
  el.textContent = msg;
  el.style.cssText = 'color:#e57373;font-size:0.85rem;margin-top:8px;';
  document.getElementById('login-btn-wrapper').after(el);
}

function initOAuthClient(silent = false) {
  const onToken = (tokenResponse) => {
    if (tokenResponse.error) {
      if (silent) {
        // Sesión expirada o permisos revocados → volver al login
        localStorage.removeItem('grungetab-authed');
        showScreen('login');
      } else {
        console.error('OAuth error:', tokenResponse.error);
      }
      return;
    }
    localStorage.setItem('grungetab-authed', '1');
    state.accessToken = tokenResponse.access_token;
    state.folderStack = [];
    showScreen('list');
    loadFolder(CONFIG.tabsFolderId, 'GrungeTab');
  };

  const config = {
    client_id: CONFIG.clientId,
    scope: SCOPES,
    callback: onToken,
  };
  // prompt: '' = solicitar token sin popup si ya se otorgó consentimiento.
  // Sin esto Google siempre muestra el selector de cuenta aunque ya haya sesión.
  if (silent) {
    config.prompt = '';
    config.error_callback = () => {
      localStorage.removeItem('grungetab-authed');
      showScreen('login');
    };
  }

  const client = google.accounts.oauth2.initTokenClient(config);
  client.requestAccessToken();
}

function logout() {
  const token = state.accessToken;
  state.accessToken = null;
  state.allItems = [];
  state.folderStack = [];
  docList.innerHTML = '<div id="list-loading">Cargando documentos...</div>';
  searchInput.value = '';
  localStorage.removeItem('grungetab-authed');
  pause();
  showScreen('login');
  if (token) google.accounts.oauth2.revoke(token);
}

// ── Drive API: navegar carpetas ───────────────────────────────────────────────
async function loadFolder(folderId, folderName) {
  docList.innerHTML = '<div id="list-loading">Cargando...</div>';
  listTitle.textContent = folderName;
  btnListBack.classList.toggle('hidden', state.folderStack.length === 0);
  searchInput.value = '';

  try {
    let items = [];
    let pageToken = null;

    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.folder')`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
        orderBy: 'name',
        pageSize: 100,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await driveGet(`https://www.googleapis.com/drive/v3/files?${params}`);
      items = items.concat(res.files || []);
      pageToken = res.nextPageToken || null;
    } while (pageToken);

    // Carpetas primero, luego docs — cada grupo ordenado por nombre
    items.sort((a, b) => {
      const aFolder = a.mimeType === 'application/vnd.google-apps.folder';
      const bFolder = b.mimeType === 'application/vnd.google-apps.folder';
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      return a.name.localeCompare(b.name, 'es');
    });

    state.allItems = items;
    renderItems(items);

  } catch (err) {
    docList.innerHTML = `<div id="list-error">Error cargando.<br><small>${err.message}</small></div>`;
  }
}

function currentFolder() {
  if (state.folderStack.length === 0) return { id: CONFIG.tabsFolderId, name: 'GrungeTab' };
  return state.folderStack[state.folderStack.length - 1];
}

function navigateInto(folder) {
  state.folderStack.push(folder);
  loadFolder(folder.id, folder.name);
}

function navigateUp() {
  state.folderStack.pop();
  const parent = currentFolder();
  loadFolder(parent.id, parent.name);
}

function renderItems(items) {
  if (items.length === 0) {
    docList.innerHTML = '<div id="list-loading">Carpeta vacía.</div>';
    return;
  }

  docList.innerHTML = items.map(item => {
    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    const icon = isFolder ? '📁' : '📄';
    const date = new Date(item.modifiedTime).toLocaleDateString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const meta = isFolder ? '' : `<div class="doc-date">Modificado: ${date}</div>`;
    return `
      <div class="doc-item${isFolder ? ' folder-item' : ''}"
           data-id="${item.id}"
           data-name="${escapeHtml(item.name)}"
           data-type="${isFolder ? 'folder' : 'doc'}">
        <span class="doc-icon">${icon}</span>
        <div class="doc-info">
          <div class="doc-name">${escapeHtml(item.name)}</div>
          ${meta}
        </div>
        <span class="doc-arrow">›</span>
      </div>
    `;
  }).join('');

  docList.querySelectorAll('.doc-item').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.type === 'folder') {
        navigateInto({ id: el.dataset.id, name: el.dataset.name });
      } else {
        openDoc(el.dataset.id, el.dataset.name);
      }
    });
  });
}

// ── Búsqueda ──────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? state.allItems.filter(d => d.name.toLowerCase().includes(q))
    : state.allItems;
  renderItems(filtered);
});

// ── Renderizado de Google Docs ─────────────────────────────────────────────────
function renderGoogleDoc(doc) {
  if (!doc.body || !doc.body.content) return '<p>Documento vacío.</p>';
  let html = '';
  for (const block of doc.body.content) {
    if (block.paragraph) html += renderParagraph(block.paragraph);
    else if (block.table) html += renderTable(block.table);
  }
  return html;
}

function renderParagraph(para) {
  if (!para.elements) return '';
  let line = '';
  for (const el of para.elements) {
    if (el.textRun) {
      const text  = escapeHtml(el.textRun.content || '');
      const style = el.textRun.textStyle || {};
      let span = text;
      if (style.bold)   span = `<strong>${span}</strong>`;
      if (style.italic) span = `<em>${span}</em>`;
      line += span;
    } else if (el.inlineObjectElement) {
      const objId = el.inlineObjectElement.inlineObjectId;
      const obj   = doc_current?.inlineObjects?.[objId];
      if (obj) {
        const props = obj.inlineObjectProperties?.embeddedObject;
        if (props?.imageProperties?.contentUri) {
          line += `<img src="${props.imageProperties.contentUri}" alt="imagen" />`;
        }
      }
    }
  }
  // Saltos de línea suaves (Shift+Enter en Google Docs) → <br> explícito.
  // El último textRun de cada párrafo termina con \n; lo eliminamos antes de
  // cerrar el <p> para evitar una línea vacía extra al pie de cada párrafo.
  line = line.replace(/\n/g, '<br>');
  line = line.replace(/<br>\s*$/, '');

  const style = para.paragraphStyle?.namedStyleType || '';
  if (style.startsWith('HEADING')) {
    const level = style.replace('HEADING_', '') || '2';
    return `<h${level}>${line}</h${level}>\n`;
  }
  return `<p>${line}</p>\n`;
}

function renderTable(table) {
  // Las tablas de Google Docs se usan para alinear acordes sobre letras.
  // Cada fila puede tener múltiples celdas (una por acorde/sección) que
  // desbordarían la pantalla si no se les da scroll horizontal propio.
  let html = '<div class="tab-table">';
  html += '<table>';
  for (const row of (table.tableRows || [])) {
    html += '<tr>';
    for (const cell of (row.tableCells || [])) {
      let cellContent = '';
      for (const block of (cell.content || [])) {
        if (block.paragraph) cellContent += renderParagraph(block.paragraph);
      }
      html += `<td>${cellContent}</td>`;
    }
    html += '</tr>';
  }
  html += '</table></div>\n';
  return html;
}

let doc_current = null;

async function openDoc(docId, docName) {
  songTitle.textContent = docName;
  tabContent.innerHTML  = '<p style="padding:16px;opacity:.5">Cargando...</p>';
  showScreen('reader');
  container.scrollTop = 0;
  pause();

  try {
    const doc = await driveGet(`https://docs.googleapis.com/v1/documents/${docId}`);
    doc_current = doc;
    tabContent.innerHTML = `<div class="doc-rendered">${renderGoogleDoc(doc)}</div>`;
    resolveAuthImages(tabContent);
  } catch (err) {
    tabContent.innerHTML = `<p style="padding:16px;color:#e57373">Error cargando el documento.<br><small>${err.message}</small></p>`;
  }
}

// ── Imágenes autenticadas (fix CORS) ─────────────────────────────────────────
// Las imágenes de Google Docs requieren el token para cargarse.
// Las obtenemos con fetch autenticado y las reemplazamos por blob URLs.
async function resolveAuthImages(container) {
  const imgs = container.querySelectorAll('img[src]');
  await Promise.allSettled(Array.from(imgs).map(async (img) => {
    try {
      const res = await fetch(img.src, {
        headers: { Authorization: `Bearer ${state.accessToken}` },
      });
      if (!res.ok) { img.style.display = 'none'; return; }
      const blob = await res.blob();
      img.src = URL.createObjectURL(blob);
    } catch {
      img.style.display = 'none';
    }
  }));
}

// ── Helper: fetch autenticado ─────────────────────────────────────────────────
async function driveGet(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${state.accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Helper: escape HTML ───────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Scroll automático ─────────────────────────────────────────────────────────
function scrollStep(timestamp) {
  if (!state.playing) return;

  if (state.lastTimestamp === null) {
    state.lastTimestamp = timestamp;
    state.rafId = requestAnimationFrame(scrollStep);
    return;
  }

  const elapsed = (timestamp - state.lastTimestamp) / 1000;
  state.lastTimestamp = timestamp;

  state.scrollAccum += pxPerSecond(state.speed) * elapsed;

  if (state.scrollAccum >= 1) {
    const px = Math.floor(state.scrollAccum);
    state.scrollAccum -= px;
    container.scrollTop += px;
  }

  const maxScroll = container.scrollHeight - container.clientHeight;
  if (container.scrollTop >= maxScroll) {
    pause();
    return;
  }

  state.rafId = requestAnimationFrame(scrollStep);
}

function play() {
  state.playing = true;
  state.lastTimestamp = null;
  btnPlay.textContent = '⏸ Pausar';
  state.rafId = requestAnimationFrame(scrollStep);
  scheduleHide();
}

function pause() {
  state.playing = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
  state.lastTimestamp = null;
  state.scrollAccum = 0;
  btnPlay.textContent = '▶ Reproducir';
  showControls();
}

function togglePlay() {
  state.playing ? pause() : play();
}

// ── Visibilidad de controles ──────────────────────────────────────────────────
function showControls() {
  controls.classList.remove('hidden');
  clearTimeout(state.hideTimer);
}

function scheduleHide() {
  clearTimeout(state.hideTimer);
  if (state.playing) {
    state.hideTimer = setTimeout(() => controls.classList.add('hidden'), 3000);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
btnPlay.addEventListener('click', togglePlay);
btnBack.addEventListener('click',     ()  => { pause(); showScreen('list'); });
btnTop.addEventListener('click',      (e) => { e.stopPropagation(); pause(); container.scrollTo({ top: 0, behavior: 'smooth' }); });
btnTheme.addEventListener('click',    (e) => { e.stopPropagation(); toggleTheme(); });
btnListTheme.addEventListener('click',(e) => { e.stopPropagation(); toggleTheme(); });
btnLogout.addEventListener('click',   (e) => { e.stopPropagation(); logout(); });
btnListBack.addEventListener('click', (e) => { e.stopPropagation(); navigateUp(); });
btnWrap.addEventListener('click',     (e) => { e.stopPropagation(); applyWrap(!state.noWrap); showControls(); scheduleHide(); });

fontSlider.addEventListener('input', () => {
  applyFontSize(parseInt(fontSlider.value, 10));
  showControls();
  scheduleHide();
});

container.addEventListener('click', () => {
  if (controls.classList.contains('hidden')) {
    showControls();
    scheduleHide();
  } else {
    togglePlay();
  }
});

speedSlider.addEventListener('input', () => {
  state.speed = parseInt(speedSlider.value, 10);
  speedLabel.textContent = SPEED_LABELS[state.speed];
  state.lastTimestamp = null;
  state.scrollAccum = 0;
  showControls();
  scheduleHide();
});

document.addEventListener('touchstart', () => {
  if (screenReader.classList.contains('hidden')) return;
  if (controls.classList.contains('hidden')) {
    showControls();
    scheduleHide();
  }
}, { passive: true });

// ── Service Worker (solo en producción) ───────────────────────────────────────
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadTheme();
loadViewPrefs();
speedLabel.textContent = SPEED_LABELS[state.speed];
speedSlider.value = state.speed;

if (localStorage.getItem('grungetab-authed') === '1') {
  // Hay una sesión previa: esperar a que cargue GIS e intentar token silencioso.
  // Si falla (sesión expirada, permisos revocados) initOAuthClient(true) muestra el login.
  (function waitForGIS() {
    if (typeof google !== 'undefined' && google.accounts?.oauth2) {
      initOAuthClient(true);
    } else {
      setTimeout(waitForGIS, 50);
    }
  })();
} else {
  showScreen('login');
}