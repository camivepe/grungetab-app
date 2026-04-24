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

const RECENTS_MAX = 10;
const PINS_MAX    = 20;

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

  // PDF viewer
  pdfDoc: null,
  pdfScale: 1.0,

  // Navegación de carpetas
  allItems: [],
  folderStack: [], // [{id, name}]

  // Archivo actualmente abierto en el reader
  currentFile: null, // {id, name, type: 'doc'|'txt'|'pdf'}
  currentDoc:  null, // documento Google Docs actualmente cargado

  // Invertir imágenes en modo oscuro
  invertImages: true,

  // Caché en memoria de localStorage (invalidar en savePins/saveRecents)
  pins:    [],
  recents: [],
  setlist: [],
};

const SETLIST_MAX = 30;

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
const btnReload    = document.getElementById('btn-reload');
const btnBack      = document.getElementById('btn-back');
const btnTheme     = document.getElementById('btn-theme');
const btnListTheme = document.getElementById('btn-list-theme');
const btnLogout    = document.getElementById('btn-logout');
const speedLabel     = document.getElementById('speed-label');
const songTitle      = document.getElementById('song-title');
const fileTypeBadge  = document.getElementById('file-type-badge');
const fontLabel      = document.getElementById('font-label');
const btnWrap        = document.getElementById('btn-wrap');
const btnSettings    = document.getElementById('btn-settings');
const settingsPanel  = document.getElementById('settings-panel');
const btnSpeedDown   = document.getElementById('btn-speed-down');
const btnSpeedUp     = document.getElementById('btn-speed-up');
const btnFontDown    = document.getElementById('btn-font-down');
const btnFontUp      = document.getElementById('btn-font-up');
const zoomControl    = document.getElementById('zoom-control');
const zoomLabel      = document.getElementById('zoom-label');
const btnZoomIn      = document.getElementById('btn-zoom-in');
const btnZoomOut     = document.getElementById('btn-zoom-out');
const offlinePill      = document.getElementById('offline-pill');
const btnClearCache    = document.getElementById('btn-clear-cache');
const btnInvertImgs    = document.getElementById('btn-invert-imgs');
const invertControl    = document.getElementById('invert-control');
const btnPrevSection   = document.getElementById('btn-prev-section');
const btnNextSection   = document.getElementById('btn-next-section');
const btnInstall       = document.getElementById('btn-install');
const btnSetlist       = document.getElementById('btn-setlist');
const setlistBadge     = document.getElementById('setlist-badge');
const setlistPanel     = document.getElementById('setlist-panel');
const setlistItems     = document.getElementById('setlist-items');
const btnSetlistClear  = document.getElementById('btn-setlist-clear');
const btnSetlistClose  = document.getElementById('btn-setlist-close');
const btnSetlistPrev   = document.getElementById('btn-setlist-prev');
const btnSetlistNext   = document.getElementById('btn-setlist-next');

// ── Navegación entre pantallas ────────────────────────────────────────────────
function showScreen(name) {
  screenLogin.classList.add('hidden');
  screenList.classList.add('hidden');
  screenReader.classList.add('hidden');

  if (name === 'login')  screenLogin.classList.remove('hidden');
  if (name === 'list')   screenList.classList.remove('hidden');
  if (name === 'reader') screenReader.classList.remove('hidden');

  if (name === 'reader') requestWakeLock();
  else releaseWakeLock();
}

// ── Wake Lock: mantener la pantalla encendida en el reader ────────────────────
let wakeLockSentinel = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLockSentinel) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
  } catch {
    // denegado, batería baja, pestaña oculta, etc. — silencioso
  }
}

function releaseWakeLock() {
  if (!wakeLockSentinel) return;
  wakeLockSentinel.release().catch(() => {});
  wakeLockSentinel = null;
}

// El navegador libera el wake lock al ocultar la pestaña; re-pedirlo al volver.
// Además, al pasar a hidden guardamos la posición de scroll por si el usuario
// cierra la pestaña o cambia de app (popstate no corre en esos casos).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !screenReader.classList.contains('hidden')) {
    requestWakeLock();
  } else if (document.visibilityState === 'hidden' && state.currentFile) {
    saveScrollPos(state.currentFile.id, container.scrollTop);
  }
});

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

function applyInvertImages(val) {
  state.invertImages = val;
  document.body.classList.toggle('no-invert-imgs', !val);
  if (btnInvertImgs) btnInvertImgs.textContent = val ? '🖼 Invertir imágenes: ON' : '🖼 Invertir imágenes: OFF';
  localStorage.setItem('grungetab-invertimgs', val ? '1' : '0');
}

function loadViewPrefs() {
  const size = parseInt(localStorage.getItem('grungetab-fontsize'), 10);
  applyFontSize(size >= 1 && size <= 4 ? size : 2);
  applyWrap(localStorage.getItem('grungetab-nowrap') === '1');
  applyInvertImages(localStorage.getItem('grungetab-invertimgs') !== '0');
}

// ── Recientes y Fijados ───────────────────────────────────────────────────────
function loadRecents() {
  try { return JSON.parse(localStorage.getItem('grungetab-recents') || '[]'); }
  catch { return []; }
}
function saveRecents(arr) {
  state.recents = arr;
  localStorage.setItem('grungetab-recents', JSON.stringify(arr));
}
function addRecent(item) {
  const r = state.recents.filter(x => x.id !== item.id);
  r.unshift(item);
  saveRecents(r.slice(0, RECENTS_MAX));
}

function loadPins() {
  try { return JSON.parse(localStorage.getItem('grungetab-pins') || '[]'); }
  catch { return []; }
}
function savePins(arr) {
  state.pins = arr;
  localStorage.setItem('grungetab-pins', JSON.stringify(arr));
}
function togglePin(item) {
  const pins = state.pins.slice();
  const idx  = pins.findIndex(p => p.id === item.id);
  if (idx >= 0) pins.splice(idx, 1);
  else if (pins.length < PINS_MAX) pins.push(item);
  savePins(pins);
}

function removeRecent(id) {
  saveRecents(state.recents.filter(x => x.id !== id));
}

// ── Setlist (cola de práctica) ────────────────────────────────────────────────
function loadSetlist() {
  try { return JSON.parse(localStorage.getItem('grungetab-setlist') || '[]'); }
  catch { return []; }
}
function saveSetlist(arr) {
  state.setlist = arr;
  localStorage.setItem('grungetab-setlist', JSON.stringify(arr));
  updateSetlistBadge();
}
function toggleInSetlist(item) {
  const arr = state.setlist.slice();
  const idx = arr.findIndex(x => x.id === item.id);
  if (idx >= 0) arr.splice(idx, 1);
  else if (arr.length < SETLIST_MAX) arr.push(item);
  saveSetlist(arr);
}
function clearSetlist() {
  saveSetlist([]);
}
function currentSetlistIndex() {
  if (!state.currentFile) return -1;
  return state.setlist.findIndex(x => x.id === state.currentFile.id);
}
function setlistGoto(delta) {
  const i = currentSetlistIndex();
  if (i < 0) return;
  const j = i + delta;
  if (j < 0 || j >= state.setlist.length) return;
  const next = state.setlist[j];
  if (next.type === 'doc') openDoc(next.id, next.name);
  else if (next.type === 'txt') openTxt(next.id, next.name);
  else if (next.type === 'pdf') openPdf(next.id, next.name);
}

function updateSetlistBadge() {
  const n = state.setlist.length;
  if (!setlistBadge) return;
  setlistBadge.textContent = String(n);
  setlistBadge.classList.toggle('hidden', n === 0);
}

function renderSetlistPanel() {
  if (!setlistItems) return;
  if (state.setlist.length === 0) {
    setlistItems.innerHTML = '<div class="setlist-empty">Setlist vacío. Agregá canciones con 🎼.</div>';
    return;
  }
  const icons = { doc: '📄', txt: '🎸', pdf: '📕' };
  setlistItems.innerHTML = state.setlist.map((it, i) => `
    <div class="setlist-item" data-id="${it.id}" data-name="${escapeHtml(it.name)}" data-type="${it.type}">
      <span class="setlist-num">${i + 1}</span>
      <span class="doc-icon">${icons[it.type] || '📄'}</span>
      <div class="doc-name">${escapeHtml(it.name)}</div>
      <button class="setlist-up"  data-id="${it.id}" title="Subir">▲</button>
      <button class="setlist-down" data-id="${it.id}" title="Bajar">▼</button>
      <button class="setlist-remove" data-id="${it.id}" title="Quitar">✕</button>
    </div>
  `).join('');

  setlistItems.querySelectorAll('.setlist-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const { id, name, type } = el.dataset;
      setlistPanel.classList.add('hidden');
      if (type === 'doc') openDoc(id, name);
      else if (type === 'txt') openTxt(id, name);
      else if (type === 'pdf') openPdf(id, name);
    });
  });
  setlistItems.querySelectorAll('.setlist-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveSetlist(state.setlist.filter(x => x.id !== btn.dataset.id));
      renderSetlistPanel();
      applySearch();
    });
  });
  const move = (id, delta) => {
    const arr = state.setlist.slice();
    const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    saveSetlist(arr);
    renderSetlistPanel();
  };
  setlistItems.querySelectorAll('.setlist-up').forEach(btn =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); move(btn.dataset.id, -1); }));
  setlistItems.querySelectorAll('.setlist-down').forEach(btn =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); move(btn.dataset.id, +1); }));
}

function refreshSetlistReaderNav() {
  if (!btnSetlistPrev || !btnSetlistNext) return;
  const i = currentSetlistIndex();
  btnSetlistPrev.classList.toggle('hidden', i <= 0);
  btnSetlistNext.classList.toggle('hidden', i < 0 || i >= state.setlist.length - 1);
}

// ── Auth: Google Identity Services ────────────────────────────────────────────
window.onGoogleLogin = async function(response) {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${response.credential}`
    );
    if (!res.ok) throw new Error('Token inválido');
    const payload = await res.json();
    // Verificar que el token fue emitido para esta app y para el email autorizado
    if (payload.aud !== CONFIG.clientId)        throw new Error('Audience inválido');
    if (payload.email !== CONFIG.allowedEmail)  { showLoginError('Acceso no autorizado.'); return; }
    initOAuthClient(false, payload.email);
  } catch (e) {
    showLoginError('Error de autenticación.');
  }
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

function initOAuthClient(silent = false, loginHint = '') {
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
    // Pusheamos una entry "home" para que el primer Atrás desde home dispare
    // popstate (donde lo atrapamos) en vez de salir al navegador.
    if (history.state?.folder !== 'home') {
      history.pushState({ screen: 'list', folder: 'home' }, '');
    }
    loadFolder(CONFIG.tabsFolderId, 'GrungeTab');
  };

  // Intenta silencioso primero (sin picker); si no hay consentimiento previo,
  // reintenta con popup completo. Evita el doble selector de cuenta cuando el
  // usuario ya eligió una en GIS y dió consentimiento antes.
  const runSilent = () => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.clientId,
      scope: SCOPES,
      callback: onToken,
      hint: loginHint || undefined,
      prompt: '',
      error_callback: () => {
        if (silent) {
          localStorage.removeItem('grungetab-authed');
          showScreen('login');
          return;
        }
        runInteractive();
      },
    });
    client.requestAccessToken();
  };

  const runInteractive = () => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.clientId,
      scope: SCOPES,
      callback: onToken,
      hint: loginHint || undefined,
    });
    client.requestAccessToken();
  };

  // silent=true (reanudar sesión): sólo probar silencioso, fallar a login.
  // silent=false (login inicial con hint): probar silencioso, fallback a interactivo.
  // silent=false (sin hint): directo a interactivo.
  if (silent || loginHint) runSilent();
  else runInteractive();
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
        q: `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.folder' or mimeType='text/plain' or mimeType='application/pdf')`,
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
    docList.innerHTML = `<div id="list-error">Error cargando.<br><small>${err.message}</small><br><button id="btn-retry-folder" style="margin-top:12px">Reintentar</button></div>`;
    document.getElementById('btn-retry-folder')?.addEventListener('click', () => loadFolder(folderId, folderName));
  }
}

function currentFolder() {
  if (state.folderStack.length === 0) return { id: CONFIG.tabsFolderId, name: 'GrungeTab' };
  return state.folderStack[state.folderStack.length - 1];
}

function navigateInto(folder) {
  state.folderStack.push(folder);
  history.pushState({ screen: 'list', folder: folder.id }, '');
  loadFolder(folder.id, folder.name);
}

function navigateUp() {
  state.folderStack.pop();
  const parent = currentFolder();
  loadFolder(parent.id, parent.name);
}

// Solo pushea una entry nueva si aún no estamos en ese reader. Así reloadCurrentFile
// (que re-llama openDoc/openTxt/openPdf) no duplica entries del history.
function pushReaderState(id) {
  if (history.state?.screen === 'reader' && history.state?.id === id) return;
  history.pushState({ screen: 'reader', id }, '');
}

// Libera el estado pesado del reader (JSON de Docs, PDFDocumentProxy con
// sus workers) al salir. Se llama en las transiciones reader → list.
function cleanupReaderState() {
  if (state.currentFile) {
    saveScrollPos(state.currentFile.id, container.scrollTop);
  }
  if (state.pdfDoc) {
    try { state.pdfDoc.destroy(); } catch {}
    state.pdfDoc = null;
  }
  state.currentDoc  = null;
  state.currentFile = null;
}

// Historial: el botón Atrás del navegador/Android vuelve a la lista o sube de
// carpeta en vez de salir de la app. Los botones internos disparan history.back()
// y el resto lo maneja este handler.
window.addEventListener('popstate', () => {
  if (!screenReader.classList.contains('hidden')) {
    pause();
    cleanupReaderState();
    showScreen('list');
    return;
  }
  if (!screenList.classList.contains('hidden')) {
    if (state.folderStack.length > 0) {
      navigateUp();
    } else {
      // Home: re-pusheamos para atrapar el Atrás y no salir de la app.
      history.pushState({ screen: 'list', folder: 'home' }, '');
    }
  }
});

function renderQuickAccess(pinIds, setIds) {
  if (searchInput.value.trim()) return '';

  const pins    = state.pins;
  const recents = state.recents.filter(r => !pinIds.has(r.id));
  if (pins.length === 0 && recents.length === 0) return '';

  const icons = { doc: '📄', txt: '🎸', pdf: '📕', folder: '📁' };
  const setlistBtnHtml = (item) => {
    if (item.type === 'folder') return '';
    const inSet = setIds.has(item.id);
    return `<button class="btn-setlist-add${inSet ? ' added' : ''}"
             data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-type="${item.type}"
             title="${inSet ? 'Quitar del setlist' : 'Agregar al setlist'}">${inSet ? '✓' : '🎼'}</button>`;
  };
  const pinItemHtml = (item) => {
    const pinned = pinIds.has(item.id);
    return `
      <div class="doc-item quick-item"
           data-id="${item.id}"
           data-name="${escapeHtml(item.name)}"
           data-type="${item.type}">
        <span class="doc-icon">${icons[item.type] || '📄'}</span>
        <div class="doc-info"><div class="doc-name">${escapeHtml(item.name)}</div></div>
        ${setlistBtnHtml(item)}
        <button class="btn-pin${pinned ? ' pinned' : ''}"
                data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-type="${item.type}"
                title="${pinned ? 'Quitar pin' : 'Fijar'}">📌</button>
        <span class="doc-arrow">›</span>
      </div>`;
  };
  const recentItemHtml = (item) => {
    const pinned = pinIds.has(item.id);
    return `
      <div class="doc-item quick-item"
           data-id="${item.id}"
           data-name="${escapeHtml(item.name)}"
           data-type="${item.type}">
        <span class="doc-icon">${icons[item.type] || '📄'}</span>
        <div class="doc-info"><div class="doc-name">${escapeHtml(item.name)}</div></div>
        ${setlistBtnHtml(item)}
        <button class="btn-pin${pinned ? ' pinned' : ''}"
                data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-type="${item.type}"
                title="${pinned ? 'Quitar pin' : 'Fijar'}">📌</button>
        <button class="btn-remove-recent"
                data-id="${item.id}" title="Quitar de recientes">✕</button>
        <span class="doc-arrow">›</span>
      </div>`;
  };

  const pinsCollapsed    = localStorage.getItem('grungetab-pins-collapsed')    === '1';
  const recentsCollapsed = localStorage.getItem('grungetab-recents-collapsed') === '1';
  const chev = (collapsed) => collapsed ? '▸' : '▾';

  const section = (key, title, count, itemsHtml, collapsed) => `
    <div class="quick-section${collapsed ? ' collapsed' : ''}" data-section="${key}">
      <button class="quick-section-header" type="button" data-section="${key}">
        <span class="quick-chev">${chev(collapsed)}</span>
        <span>${title}</span>
        <span class="quick-count">${count}</span>
      </button>
      <div class="quick-section-body">${itemsHtml}</div>
    </div>`;

  let html = '';
  if (pins.length > 0) {
    html += section('pins', 'Fijados', pins.length, pins.map(pinItemHtml).join(''), pinsCollapsed);
  }
  if (recents.length > 0) {
    html += section('recents', 'Recientes', recents.length, recents.map(recentItemHtml).join(''), recentsCollapsed);
  }
  return html;
}

function renderItems(items) {
  const pinIds = new Set(state.pins.map(p => p.id));
  const setIds = new Set(state.setlist.map(s => s.id));

  let html = renderQuickAccess(pinIds, setIds);

  if (items.length === 0) {
    if (!html) {
      docList.innerHTML = '<div id="list-loading">Carpeta vacía.</div>';
      return;
    }
    docList.innerHTML = html;
  } else {
    html += items.map(item => {
      const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
      const isTxt    = item.mimeType === 'text/plain';
      const isPdf    = item.mimeType === 'application/pdf';
      const icon = isFolder ? '📁' : isTxt ? '🎸' : isPdf ? '📕' : '📄';
      const type = isFolder ? 'folder' : isTxt ? 'txt' : isPdf ? 'pdf' : 'doc';
      const date = new Date(item.modifiedTime).toLocaleDateString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
      const meta   = isFolder ? '' : `<div class="doc-date">Modificado: ${date}</div>`;
      const pinBtn = `<button class="btn-pin${pinIds.has(item.id) ? ' pinned' : ''}"
               data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-type="${type}"
               title="${pinIds.has(item.id) ? 'Quitar pin' : 'Fijar'}">📌</button>`;
      const setBtn = isFolder ? '' : `<button class="btn-setlist-add${setIds.has(item.id) ? ' added' : ''}"
               data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-type="${type}"
               title="${setIds.has(item.id) ? 'Quitar del setlist' : 'Agregar al setlist'}">${setIds.has(item.id) ? '✓' : '🎼'}</button>`;
      return `
        <div class="doc-item${isFolder ? ' folder-item' : ''}"
             data-id="${item.id}"
             data-name="${escapeHtml(item.name)}"
             data-type="${type}">
          <span class="doc-icon">${icon}</span>
          <div class="doc-info">
            <div class="doc-name">${escapeHtml(item.name)}</div>
            ${meta}
          </div>
          ${setBtn}
          ${pinBtn}
          <span class="doc-arrow">›</span>
        </div>`;
    }).join('');
    docList.innerHTML = html;
  }

  docList.querySelectorAll('.quick-section-header').forEach(hdr => {
    hdr.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = hdr.dataset.section;
      const storageKey = `grungetab-${key}-collapsed`;
      const nowCollapsed = localStorage.getItem(storageKey) !== '1';
      localStorage.setItem(storageKey, nowCollapsed ? '1' : '0');
      const section = hdr.closest('.quick-section');
      section.classList.toggle('collapsed', nowCollapsed);
      const chev = hdr.querySelector('.quick-chev');
      if (chev) chev.textContent = nowCollapsed ? '▸' : '▾';
    });
  });

  docList.querySelectorAll('.btn-remove-recent').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecent(btn.dataset.id);
      applySearch();
    });
  });

  docList.querySelectorAll('.doc-item').forEach(el => {
    const pinBtn = el.querySelector('.btn-pin');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePin({ id: pinBtn.dataset.id, name: pinBtn.dataset.name, type: pinBtn.dataset.type });
        applySearch();
      });
    }
    const setBtn = el.querySelector('.btn-setlist-add');
    if (setBtn) {
      setBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInSetlist({ id: setBtn.dataset.id, name: setBtn.dataset.name, type: setBtn.dataset.type });
        applySearch();
      });
    }
    el.addEventListener('click', () => {
      if (el.dataset.type === 'folder') {
        navigateInto({ id: el.dataset.id, name: el.dataset.name });
      } else if (el.dataset.type === 'txt') {
        openTxt(el.dataset.id, el.dataset.name);
      } else if (el.dataset.type === 'pdf') {
        openPdf(el.dataset.id, el.dataset.name);
      } else {
        openDoc(el.dataset.id, el.dataset.name);
      }
    });
  });
}

// ── Búsqueda (local inmediata + recursiva en Drive con debounce) ──────────────
let searchDebounce = null;

function normalizeForSearch(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function applySearch() {
  const q = searchInput.value.trim();
  clearTimeout(searchDebounce);
  if (!q) { renderItems(state.allItems); return; }
  const nq = normalizeForSearch(q);
  renderItems(state.allItems.filter(d => normalizeForSearch(d.name).includes(nq)));
  searchDebounce = setTimeout(() => searchDrive(q), 400);
}

async function searchDrive(query) {
  if (searchInput.value.trim() !== query) return;
  const esc = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `name contains '${esc}' and trashed=false and (mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.folder' or mimeType='text/plain' or mimeType='application/pdf')`,
    fields: 'files(id, name, mimeType, modifiedTime)',
    orderBy: 'name',
    pageSize: 50,
  });
  try {
    const res = await driveGet(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (searchInput.value.trim() !== query) return;
    renderItems(res.files || []);
  } catch { /* mantener resultados locales si falla la red */ }
}

searchInput.addEventListener('input', applySearch);

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
      const obj   = state.currentDoc?.inlineObjects?.[objId];
      if (obj) {
        const props = obj.inlineObjectProperties?.embeddedObject;
        // contentUri = imagen hosteada por Google (requiere auth).
        // sourceUri  = URL original de donde se insertó (pública, no necesita auth).
        const src = props?.imageProperties?.contentUri
                 || props?.imageProperties?.sourceUri;
        if (src) {
          line += `<img src="${escapeHtml(src)}" alt="imagen" data-original-src="${escapeHtml(src)}" data-object-id="${escapeHtml(objId)}" />`;
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

async function openDoc(docId, docName) {
  state.currentFile = { id: docId, name: docName, type: 'doc' };
  addRecent({ id: docId, name: docName, type: 'doc' });
  songTitle.textContent     = docName;
  fileTypeBadge.textContent = 'DOC';
  tabContent.innerHTML      = '<p style="padding:16px;opacity:.5">Cargando...</p>';
  setFileTypeControls('doc');
  pushReaderState(docId);
  showScreen('reader');
  container.scrollTop = 0;
  pause();
  updateMediaSessionMetadata();
  refreshSetlistReaderNav();

  try {
    const res = await authFetch(`https://docs.googleapis.com/v1/documents/${docId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    saveOffline('doc', docId, res);
    const doc = await res.json();
    state.currentDoc = doc;
    tabContent.innerHTML = `<div class="doc-rendered">${renderGoogleDoc(doc)}</div>`;
    resolveAuthImages(tabContent);
    cacheDocImages(doc, docId).catch(() => {});
    restoreScrollPos(docId);
  } catch (err) {
    const cached = await loadOffline('doc', docId);
    if (cached) {
      const doc = await cached.json();
      state.currentDoc = doc;
      tabContent.innerHTML = `<div class="doc-rendered">${renderGoogleDoc(doc)}</div>`;
      resolveOfflineImages(tabContent, docId);
      fileTypeBadge.textContent = 'DOC · OFFLINE';
      restoreScrollPos(docId);
      return;
    }
    tabContent.innerHTML = `<div style="padding:16px;color:#e57373">Error cargando el documento.<br><small>${err.message}</small><br><button id="btn-retry-content" style="margin-top:12px;color:inherit">Reintentar</button></div>`;
    document.getElementById('btn-retry-content')?.addEventListener('click', () => openDoc(docId, docName));
  }
}

async function openTxt(fileId, fileName) {
  state.currentFile = { id: fileId, name: fileName, type: 'txt' };
  addRecent({ id: fileId, name: fileName, type: 'txt' });
  songTitle.textContent     = fileName;
  fileTypeBadge.textContent = 'TXT';
  tabContent.innerHTML      = '<p style="padding:16px;opacity:.5">Cargando...</p>';
  setFileTypeControls('txt');
  pushReaderState(fileId);
  showScreen('reader');
  container.scrollTop = 0;
  pause();
  updateMediaSessionMetadata();
  refreshSetlistReaderNav();

  try {
    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveOffline('txt', fileId, res);
    const text = await res.text();
    tabContent.innerHTML = `<pre class="txt-rendered">${escapeHtml(text)}</pre>`;
    restoreScrollPos(fileId);
  } catch (err) {
    const cached = await loadOffline('txt', fileId);
    if (cached) {
      const text = await cached.text();
      tabContent.innerHTML = `<pre class="txt-rendered">${escapeHtml(text)}</pre>`;
      fileTypeBadge.textContent = 'TXT · OFFLINE';
      restoreScrollPos(fileId);
      return;
    }
    tabContent.innerHTML = `<div style="padding:16px;color:#e57373">Error cargando el archivo.<br><small>${err.message}</small><br><button id="btn-retry-content" style="margin-top:12px;color:inherit">Reintentar</button></div>`;
    document.getElementById('btn-retry-content')?.addEventListener('click', () => openTxt(fileId, fileName));
  }
}

// ── PDF viewer ────────────────────────────────────────────────────────────────
const PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const PDFJS_SRI    = 'sha384-+0ti2moQlmLN7WZHE2RHIf5lV8hHxhxEalN0il3YZceG26fUPyOkR0hp9daxk1i7';

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  const preload = document.createElement('link');
  preload.rel = 'modulepreload';
  preload.href = PDFJS_CDN;
  preload.integrity = PDFJS_SRI;
  preload.crossOrigin = 'anonymous';
  document.head.appendChild(preload);
  return import(PDFJS_CDN).then(mod => {
    window.pdfjsLib = mod;
    mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }).catch(() => { throw new Error('No se pudo cargar PDF.js'); });
}

// Muestra u oculta controles según el tipo de archivo abierto
function setFileTypeControls(type) {
  const isPdf = type === 'pdf';
  const isDoc = type === 'doc';
  zoomControl.classList.toggle('hidden', !isPdf);
  btnWrap.classList.toggle('hidden', isPdf);
  btnPrevSection.classList.toggle('hidden', !isDoc);
  btnNextSection.classList.toggle('hidden', !isDoc);
  invertControl.classList.toggle('hidden', !isDoc);
}

function jumpToSection(dir) {
  const headings = [...tabContent.querySelectorAll('.doc-rendered h1, .doc-rendered h2, .doc-rendered h3')];
  if (headings.length === 0) return;
  const currentTop = container.scrollTop + 10;
  if (dir > 0) {
    const next = headings.find(h => h.offsetTop > currentTop);
    if (next) container.scrollTo({ top: next.offsetTop - 64, behavior: 'smooth' });
  } else {
    const prev = [...headings].reverse().find(h => h.offsetTop < currentTop - 20);
    if (prev) container.scrollTo({ top: prev.offsetTop - 64, behavior: 'smooth' });
  }
}

function updateZoomLabel() {
  zoomLabel.textContent = Math.round(state.pdfScale * 100) + '%';
}

// Renderiza las páginas del PDF de forma lazy: primero crea canvas con las
// dimensiones correctas (placeholders), luego renderiza solo las páginas
// visibles (+ 300px de margen) usando IntersectionObserver.
async function renderPdfPages() {
  if (pdfPageObserver) { pdfPageObserver.disconnect(); pdfPageObserver = null; }

  const pdf = state.pdfDoc;
  const prevScrollTop = container.scrollTop;
  const baseW = tabContent.clientWidth || (container.clientWidth - 32);
  lastPdfBaseWidth = baseW;

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-rendered';
  tabContent.innerHTML = '';
  tabContent.appendChild(wrapper);

  const pageEntries = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page      = await pdf.getPage(pageNum);
    const naturalVp = page.getViewport({ scale: 1 });
    const scale     = (baseW / naturalVp.width) * state.pdfScale;
    const viewport  = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    canvas.style.cssText = `width:${viewport.width}px;max-width:none;display:block;margin-bottom:${pageNum < pdf.numPages ? '8' : '120'}px;`;
    canvas.dataset.pageIdx  = pageEntries.length;
    canvas.dataset.rendered = '0';

    wrapper.appendChild(canvas);
    pageEntries.push({ canvas, page, viewport });
  }

  container.scrollTop = prevScrollTop;

  pdfPageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const cvs = entry.target;
      if (cvs.dataset.rendered === '1') continue;
      cvs.dataset.rendered = '1';
      pdfPageObserver.unobserve(cvs);
      const { page, viewport } = pageEntries[Number(cvs.dataset.pageIdx)];
      page.render({ canvasContext: cvs.getContext('2d'), viewport }).promise.catch(() => {});
    }
  }, { root: container, rootMargin: '300px' });

  for (const { canvas } of pageEntries) {
    pdfPageObserver.observe(canvas);
  }
}

let pdfZoomDebounce = null;
let pdfPageObserver = null;
let lastPdfBaseWidth = 0;
let pdfResizeDebounce = null;

function savePdfScale() {
  localStorage.setItem('grungetab-pdfscale', String(state.pdfScale));
}
function loadPdfScale() {
  const v = parseFloat(localStorage.getItem('grungetab-pdfscale'));
  return Number.isFinite(v) ? Math.max(0.5, Math.min(3.0, v)) : 1.0;
}

// ── Posición de scroll por archivo ────────────────────────────────────────────
const SCROLLPOS_MAX = 50;
const SCROLLPOS_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días

function saveScrollPos(fileId, pos) {
  try {
    const raw = localStorage.getItem('grungetab-scrollpos');
    const map = raw ? JSON.parse(raw) : {};
    if (pos > 0) {
      map[fileId] = { pos, ts: Date.now() };
    } else {
      delete map[fileId];
    }
    const now = Date.now();
    let entries = Object.entries(map).filter(([, v]) => now - v.ts < SCROLLPOS_TTL);
    if (entries.length > SCROLLPOS_MAX) {
      entries.sort((a, b) => b[1].ts - a[1].ts);
      entries = entries.slice(0, SCROLLPOS_MAX);
    }
    localStorage.setItem('grungetab-scrollpos', JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

function loadScrollPos(fileId) {
  try {
    const raw = localStorage.getItem('grungetab-scrollpos');
    if (!raw) return 0;
    const entry = JSON.parse(raw)[fileId];
    if (!entry) return 0;
    if (Date.now() - entry.ts > SCROLLPOS_TTL) return 0;
    return entry.pos || 0;
  } catch { return 0; }
}

// Restaura el scroll a la última posición guardada. Se llama tras render.
// Umbral: si está cerca del inicio (<50px), quedarse en 0 para no ser molesto.
function restoreScrollPos(fileId) {
  const pos = loadScrollPos(fileId);
  if (pos > 50) container.scrollTop = pos;
}

async function setPdfZoom(delta) {
  if (!state.pdfDoc) return;
  state.pdfScale = Math.max(0.5, Math.min(3.0, state.pdfScale + delta));
  savePdfScale();
  updateZoomLabel();

  // Feedback visual inmediato vía CSS transform sobre el wrapper existente
  const wrapper = tabContent.querySelector('.pdf-rendered');
  if (wrapper) {
    wrapper.style.transformOrigin = 'top left';
    wrapper.style.transform = `scale(${state.pdfScale})`;
  }

  // Re-render real con debounce para no re-dibujar cada canvas en cada click
  clearTimeout(pdfZoomDebounce);
  pdfZoomDebounce = setTimeout(async () => {
    if (wrapper) wrapper.style.transform = '';
    await renderPdfPages();
  }, 350);
}

async function openPdf(fileId, fileName) {
  state.currentFile = { id: fileId, name: fileName, type: 'pdf' };
  addRecent({ id: fileId, name: fileName, type: 'pdf' });
  songTitle.textContent     = fileName;
  fileTypeBadge.textContent = 'PDF';
  tabContent.innerHTML      = '<p style="padding:16px;opacity:.5">Cargando PDF...</p>';
  pushReaderState(fileId);
  showScreen('reader');
  container.scrollTop = 0;
  pause();
  setFileTypeControls('pdf');
  updateMediaSessionMetadata();
  refreshSetlistReaderNav();
  state.pdfScale = loadPdfScale();
  updateZoomLabel();

  try {
    await loadPdfJs();

    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveOffline('pdf', fileId, res);
    const data = await res.arrayBuffer();

    state.pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    await renderPdfPages();
    restoreScrollPos(fileId);
  } catch (err) {
    try {
      await loadPdfJs();
      const cached = await loadOffline('pdf', fileId);
      if (cached) {
        const data = await cached.arrayBuffer();
        state.pdfDoc = await pdfjsLib.getDocument({ data }).promise;
        await renderPdfPages();
        fileTypeBadge.textContent = 'PDF · OFFLINE';
        restoreScrollPos(fileId);
        return;
      }
    } catch { /* PDF.js falló al cargar offline — cae al mensaje de error */ }
    state.pdfDoc = null;
    tabContent.innerHTML = `<div style="padding:16px;color:#e57373">Error cargando el PDF.<br><small>${err.message}</small><br><button id="btn-retry-content" style="margin-top:12px;color:inherit">Reintentar</button></div>`;
    document.getElementById('btn-retry-content')?.addEventListener('click', () => openPdf(fileId, fileName));
  }
}

// ── Imágenes de Google Docs ───────────────────────────────────────────────────
// Los contentUri de la Docs API ya llevan autenticación en el parámetro ?key=,
// por lo que los <img> los cargan directamente sin fetch adicional.
// Si la imagen falla (key expirado, etc.), intentamos fetch con Authorization
// header y exponerla como Blob URL — así el access_token nunca queda en la URL
// del <img> ni se filtra a Referer/historial/logs.
function resolveAuthImages(container) {
  container.querySelectorAll('img[data-original-src]').forEach(img => {
    img.onerror = async () => {
      img.onerror = null; // evitar loop
      try {
        const res = await fetch(img.dataset.originalSrc, {
          headers: { Authorization: `Bearer ${state.accessToken}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
      } catch {
        // CORS, red, etc. — imagen queda rota (fallback silencioso)
      }
    };
  });
}

function offlineImageKey(docId, objectId) {
  return `/offline/doc-image/${encodeURIComponent(docId)}/${encodeURIComponent(objectId)}`;
}

// Fetchea cada inlineObject con auth y lo guarda en OFFLINE_CACHE. Fire-and-forget:
// las imágenes que no se alcanzaron a cachear quedan rotas al cargar offline.
async function cacheDocImages(doc, docId) {
  if (!('caches' in window) || !doc?.inlineObjects) return;
  const cache = await caches.open(OFFLINE_CACHE);
  const entries = Object.entries(doc.inlineObjects);
  await Promise.all(entries.map(async ([objId, obj]) => {
    const src = obj?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri;
    if (!src) return;
    try {
      const res = await fetch(src, {
        headers: { Authorization: `Bearer ${state.accessToken}` },
      });
      if (!res.ok) return;
      await cache.put(offlineImageKey(docId, objId), res);
    } catch {
      // red, CORS, etc.
    }
  }));
}

// Al cargar un doc desde cache, reemplaza el src de cada <img> por el blob
// cacheado antes de que el browser intente fetchear el contentUri de Google.
async function resolveOfflineImages(container, docId) {
  if (!('caches' in window)) return;
  const cache = await caches.open(OFFLINE_CACHE);
  const imgs = container.querySelectorAll('img[data-object-id]');
  await Promise.all([...imgs].map(async (img) => {
    try {
      const res = await cache.match(offlineImageKey(docId, img.dataset.objectId));
      if (!res) return;
      const blob = await res.blob();
      img.src = URL.createObjectURL(blob);
    } catch {
      // silencioso
    }
  }));
}

// ── Helper: renovar token OAuth silenciosamente ───────────────────────────────
// Si dos authFetch reciben 401 en paralelo, ambos comparten la misma promesa
// en curso para evitar disparar dos flujos OAuth simultáneos.
let refreshPromise = null;
function refreshToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id:      CONFIG.clientId,
      scope:          SCOPES,
      prompt:         '',
      callback:       (r) => r.error ? reject(new Error(r.error)) : (state.accessToken = r.access_token, resolve()),
      error_callback: (e) => reject(new Error(e?.type || 'token_error')),
    });
    client.requestAccessToken();
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

// ── Helper: fetch autenticado con retry en 401 ────────────────────────────────
async function authFetch(url) {
  let res = await fetch(url, { headers: { Authorization: `Bearer ${state.accessToken}` } });
  if (res.status === 401) {
    try {
      await refreshToken();
    } catch {
      localStorage.removeItem('grungetab-authed');
      state.accessToken = null;
      showScreen('login');
      throw new Error('Sesión expirada.');
    }
    res = await fetch(url, { headers: { Authorization: `Bearer ${state.accessToken}` } });
  }
  return res;
}

async function driveGet(url) {
  const res = await authFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Cache offline de archivos del usuario ─────────────────────────────────────
// Guarda en Cache API las respuestas de docs/txt/pdf ya cargados para poder
// abrirlos sin red. El cache 'grungetab-offline-files' no lleva version hash:
// el SW lo preserva entre deploys (ver sw.js).
const OFFLINE_CACHE     = 'grungetab-offline-files';
const OFFLINE_INDEX_KEY = 'grungetab-offline-index';
const OFFLINE_MAX_FILES = 30;

function offlineKey(type, id) {
  return `/offline/${type}/${encodeURIComponent(id)}`;
}

// Índice LRU en localStorage: array de { type, id, ts }, ordenado por ts (más viejo primero).
// El cache API por sí solo no permite ordenar por fecha de inserción ni iterar eficiente.
function loadOfflineIndex() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_INDEX_KEY) || '[]'); }
  catch { return []; }
}
function saveOfflineIndex(idx) {
  localStorage.setItem(OFFLINE_INDEX_KEY, JSON.stringify(idx));
}
function touchOfflineIndex(type, id) {
  const idx = loadOfflineIndex().filter(e => !(e.type === type && e.id === id));
  idx.push({ type, id, ts: Date.now() });
  saveOfflineIndex(idx);
  return idx;
}

// Borra el archivo cacheado. Si es un doc, también borra sus imágenes asociadas.
async function evictOffline(cache, entry) {
  await cache.delete(offlineKey(entry.type, entry.id));
  if (entry.type === 'doc') {
    const prefix = `/offline/doc-image/${encodeURIComponent(entry.id)}/`;
    for (const req of await cache.keys()) {
      if (new URL(req.url).pathname.startsWith(prefix)) await cache.delete(req);
    }
  }
}

async function saveOffline(type, id, response) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put(offlineKey(type, id), response.clone());
    let idx = touchOfflineIndex(type, id);
    while (idx.length > OFFLINE_MAX_FILES) {
      await evictOffline(cache, idx.shift());
    }
    saveOfflineIndex(idx);
  } catch {
    // quota exceeded, modo incógnito, etc. — silencioso
  }
}

async function loadOffline(type, id) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const res = await cache.match(offlineKey(type, id));
    if (res) touchOfflineIndex(type, id); // marca como usado recientemente
    return res;
  } catch {
    return null;
  }
}

async function clearOfflineCache() {
  try {
    if ('caches' in window) await caches.delete(OFFLINE_CACHE);
  } catch { /* silencioso */ }
  localStorage.removeItem(OFFLINE_INDEX_KEY);
}

// ── Helper: escape HTML ───────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reloadCurrentFile() {
  const f = state.currentFile;
  if (!f) return;
  pause();
  container.scrollTop = 0;
  if (f.type === 'doc') openDoc(f.id, f.name);
  else if (f.type === 'txt') openTxt(f.id, f.name);
  else if (f.type === 'pdf') openPdf(f.id, f.name);
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
    flashEndOfDoc();
    pause();
    return;
  }

  state.rafId = requestAnimationFrame(scrollStep);
}

function flashEndOfDoc() {
  fileTypeBadge.classList.remove('badge-flash');
  void fileTypeBadge.offsetWidth; // fuerza reflow para reiniciar la animación
  fileTypeBadge.classList.add('badge-flash');
  fileTypeBadge.addEventListener('animationend', () => fileTypeBadge.classList.remove('badge-flash'), { once: true });
}

function changeSpeed(delta) {
  state.speed = Math.max(1, Math.min(4, state.speed + delta));
  speedLabel.textContent = SPEED_LABELS[state.speed];
  state.lastTimestamp = null;
  state.scrollAccum = 0;
  showControls();
  scheduleHide();
}

function play() {
  state.playing = true;
  state.lastTimestamp = null;
  btnPlay.textContent = '⏸ Pausar';
  settingsPanel.classList.add('hidden');
  btnSettings.classList.remove('active');
  state.rafId = requestAnimationFrame(scrollStep);
  scheduleHide();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  primeMediaSessionAudio();
  mediaSessionAudio?.play().catch(() => {});
}

function pause() {
  state.playing = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
  state.lastTimestamp = null;
  state.scrollAccum = 0;
  btnPlay.textContent = '▶ Reproducir';
  showControls();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  mediaSessionAudio?.pause();
}

function togglePlay() {
  state.playing ? pause() : play();
}

// ── MediaSession: pedales BT y media keys ─────────────────────────────────────
// Registra handlers para que play/pause del SO (pedales Bluetooth, airpods,
// teclado con tecla multimedia) actúen sobre el reader. Requiere un <audio>
// activo o metadata + playbackState para que el navegador tome los handlers.
let mediaSessionAudio = null;

function primeMediaSessionAudio() {
  // iOS/Safari no activa MediaSession sin un elemento de audio reproduciendo.
  // Usamos un audio silencioso que loopea — no se oye pero mantiene la sesión viva.
  if (mediaSessionAudio) return;
  const audio = document.createElement('audio');
  audio.loop = true;
  // WAV silencioso mínimo (1 frame PCM 8kHz mono)
  audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  audio.preload = 'auto';
  mediaSessionAudio = audio;
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler('play',  () => { if (!state.playing) togglePlay(); });
  ms.setActionHandler('pause', () => { if (state.playing)  togglePlay(); });
  ms.setActionHandler('previoustrack', () => { jumpToSection(-1); });
  ms.setActionHandler('nexttrack',     () => { jumpToSection(+1); });
}

function updateMediaSessionMetadata() {
  if (!('mediaSession' in navigator) || !state.currentFile) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  state.currentFile.name,
    artist: 'GrungeTab',
  });
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
btnBack.addEventListener('click',     ()  => { history.back(); });
btnReload?.addEventListener('click',  (e) => { e.stopPropagation(); reloadCurrentFile(); showControls(); });
btnTop.addEventListener('click',      (e) => { e.stopPropagation(); pause(); container.scrollTo({ top: 0, behavior: 'smooth' }); });
btnTheme.addEventListener('click',    (e) => { e.stopPropagation(); toggleTheme(); });
btnListTheme.addEventListener('click',(e) => { e.stopPropagation(); toggleTheme(); });
btnLogout.addEventListener('click',   (e) => { e.stopPropagation(); logout(); });
btnListBack.addEventListener('click', (e) => { e.stopPropagation(); history.back(); });
btnWrap.addEventListener('click',      (e) => { e.stopPropagation(); applyWrap(!state.noWrap); showControls(); scheduleHide(); });
btnZoomIn.addEventListener('click',    (e) => { e.stopPropagation(); setPdfZoom(+0.25); showControls(); scheduleHide(); });
btnZoomOut.addEventListener('click',   (e) => { e.stopPropagation(); setPdfZoom(-0.25); showControls(); scheduleHide(); });
btnSpeedDown.addEventListener('click', (e) => { e.stopPropagation(); changeSpeed(-1); });
btnSpeedUp.addEventListener('click',   (e) => { e.stopPropagation(); changeSpeed(+1); });
btnFontDown.addEventListener('click',  (e) => { e.stopPropagation(); applyFontSize(Math.max(1, state.fontSize - 1)); showControls(); scheduleHide(); });
btnFontUp.addEventListener('click',    (e) => { e.stopPropagation(); applyFontSize(Math.min(4, state.fontSize + 1)); showControls(); scheduleHide(); });
btnClearCache?.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!confirm('¿Borrar todos los archivos cacheados para uso offline?')) return;
  await clearOfflineCache();
  btnClearCache.textContent = '✓ Caché limpiada';
  setTimeout(() => { btnClearCache.textContent = '🧹 Limpiar caché offline'; }, 1500);
});
btnInvertImgs?.addEventListener('click', (e) => {
  e.stopPropagation();
  applyInvertImages(!state.invertImages);
  showControls();
  scheduleHide();
});
btnSetlist?.addEventListener('click', (e) => {
  e.stopPropagation();
  renderSetlistPanel();
  setlistPanel.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!setlistPanel || setlistPanel.classList.contains('hidden')) return;
  if (setlistPanel.contains(e.target) || btnSetlist?.contains(e.target)) return;
  setlistPanel.classList.add('hidden');
});
btnSetlistClose?.addEventListener('click', (e) => {
  e.stopPropagation();
  setlistPanel.classList.add('hidden');
});
btnSetlistClear?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!confirm('¿Vaciar el setlist?')) return;
  clearSetlist();
  renderSetlistPanel();
  applySearch();
});
btnSetlistPrev?.addEventListener('click', (e) => {
  e.stopPropagation();
  setlistGoto(-1);
});
btnSetlistNext?.addEventListener('click', (e) => {
  e.stopPropagation();
  setlistGoto(+1);
});
btnPrevSection?.addEventListener('click', (e) => {
  e.stopPropagation();
  jumpToSection(-1);
  showControls();
  scheduleHide();
});
btnNextSection?.addEventListener('click', (e) => {
  e.stopPropagation();
  jumpToSection(+1);
  showControls();
  scheduleHide();
});
btnSettings.addEventListener('click',  (e) => {
  e.stopPropagation();
  const open = settingsPanel.classList.toggle('hidden') === false;
  btnSettings.classList.toggle('active', open);
  showControls();
  scheduleHide();
});

container.addEventListener('click', () => {
  // Durante playback un tap pausa directo (no exige dos taps cuando los
  // controles están auto-ocultos). En pausa, el tap actúa sobre los controles.
  if (state.playing) {
    togglePlay();
    showControls();
    scheduleHide();
  } else if (controls.classList.contains('hidden')) {
    showControls();
    scheduleHide();
  } else {
    togglePlay();
  }
});

document.addEventListener('touchstart', () => {
  if (screenReader.classList.contains('hidden')) return;
  if (controls.classList.contains('hidden')) {
    showControls();
    scheduleHide();
  }
}, { passive: true });

// ── Pinch-to-zoom para PDFs ───────────────────────────────────────────────────
let pinchState = null; // { startDist, startScale }

container.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2 && state.pdfDoc) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchState = { startDist: Math.hypot(dx, dy), startScale: state.pdfScale };
  }
}, { passive: true });

container.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2 || !pinchState || !state.pdfDoc) return;
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  const ratio = Math.hypot(dx, dy) / pinchState.startDist;
  state.pdfScale = Math.max(0.5, Math.min(3.0, pinchState.startScale * ratio));
  updateZoomLabel();
  const wrapper = tabContent.querySelector('.pdf-rendered');
  if (wrapper) {
    wrapper.style.transformOrigin = 'top left';
    wrapper.style.transform = `scale(${ratio})`;
  }
  e.preventDefault();
}, { passive: false });

container.addEventListener('touchend', () => {
  if (!pinchState || !state.pdfDoc) return;
  pinchState = null;
  savePdfScale();
  const wrapper = tabContent.querySelector('.pdf-rendered');
  if (wrapper) wrapper.style.transform = '';
  renderPdfPages();
});

// En móvil, resize se dispara al aparecer/ocultar la barra de URL aunque el
// ancho no cambie; comparamos contra lastPdfBaseWidth para saltar esos casos.
function onPdfViewportChange() {
  if (!state.pdfDoc) return;
  clearTimeout(pdfResizeDebounce);
  pdfResizeDebounce = setTimeout(() => {
    if (!state.pdfDoc) return;
    const currentW = tabContent.clientWidth || (container.clientWidth - 32);
    if (currentW === lastPdfBaseWidth || currentW === 0) return;
    renderPdfPages();
  }, 200);
}
window.addEventListener('resize', onPdfViewportChange);
window.addEventListener('orientationchange', onPdfViewportChange);

// ── Atajos de teclado (solo en lector) ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT') {
    if (e.key === 'Escape') { searchInput.value = ''; searchInput.blur(); applySearch(); }
    return;
  }
  if (screenReader.classList.contains('hidden')) return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlay();
      showControls();
      scheduleHide();
      break;
    case 'ArrowUp':
      e.preventDefault();
      changeSpeed(+1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      changeSpeed(-1);
      break;
    case '+':
    case '=':
      e.preventDefault();
      if (state.pdfDoc) setPdfZoom(+0.25);
      else applyFontSize(Math.min(4, state.fontSize + 1));
      showControls();
      scheduleHide();
      break;
    case '-':
      e.preventDefault();
      if (state.pdfDoc) setPdfZoom(-0.25);
      else applyFontSize(Math.max(1, state.fontSize - 1));
      showControls();
      scheduleHide();
      break;
    case 'PageUp':
      e.preventDefault();
      jumpToSection(-1);
      showControls();
      scheduleHide();
      break;
    case 'PageDown':
      e.preventDefault();
      jumpToSection(+1);
      showControls();
      scheduleHide();
      break;
    case 'Escape':
      history.back();
      break;
  }
});

// ── Indicador de modo offline ─────────────────────────────────────────────────
function syncOfflineIndicator() {
  const online = navigator.onLine;
  offlinePill.classList.toggle('hidden', online);
  if (online) {
    // Badge vuelve a "DOC"/"TXT"/"PDF" sin el sufijo OFFLINE. El contenido sigue
    // siendo el cacheado hasta que el usuario recargue con ↺.
    fileTypeBadge.textContent = fileTypeBadge.textContent.replace(/\s*·\s*OFFLINE$/, '');
  }
}
window.addEventListener('online',  syncOfflineIndicator);
window.addEventListener('offline', syncOfflineIndicator);
syncOfflineIndicator();

// ── Instalación PWA ───────────────────────────────────────────────────────────
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  btnInstall?.classList.remove('hidden');
});
btnInstall?.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  btnInstall.classList.add('hidden');
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  btnInstall?.classList.add('hidden');
});

// ── Toast de actualización del SW ─────────────────────────────────────────────
function showSwUpdateToast() {
  if (document.getElementById('sw-update-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'sw-update-toast';
  toast.innerHTML = '<span>Nueva versión disponible</span><button id="btn-sw-reload">Recargar</button>';
  document.body.appendChild(toast);
  document.getElementById('btn-sw-reload').addEventListener('click', () => location.reload());
}

// ── Service Worker (solo en producción) ───────────────────────────────────────
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showSwUpdateToast();
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadTheme();
loadViewPrefs();
speedLabel.textContent = SPEED_LABELS[state.speed];
state.pins    = loadPins();
state.recents = loadRecents();
state.setlist = loadSetlist();
updateSetlistBadge();
setupMediaSession();

if (localStorage.getItem('grungetab-authed') === '1') {
  // Hay una sesión previa: esperar a que cargue GIS e intentar token silencioso.
  // Si falla (sesión expirada, permisos revocados) initOAuthClient(true) muestra el login.
  const GIS_TIMEOUT_MS = 10_000;
  const gisStart = Date.now();
  (function waitForGIS() {
    if (typeof google !== 'undefined' && google.accounts?.oauth2) {
      initOAuthClient(true);
    } else if (Date.now() - gisStart < GIS_TIMEOUT_MS) {
      setTimeout(waitForGIS, 50);
    } else {
      localStorage.removeItem('grungetab-authed');
      showLoginError('No se pudo conectar con Google. Verifica tu conexión.');
      showScreen('login');
    }
  })();
} else {
  showScreen('login');
}