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

  // Caché en memoria de localStorage (invalidar en savePins/saveRecents)
  pins:    [],
  recents: [],
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
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !screenReader.classList.contains('hidden')) {
    requestWakeLock();
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

function loadViewPrefs() {
  const size = parseInt(localStorage.getItem('grungetab-fontsize'), 10);
  applyFontSize(size >= 1 && size <= 4 ? size : 2);
  applyWrap(localStorage.getItem('grungetab-nowrap') === '1');
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
  else pins.push(item);
  savePins(pins);
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

  const config = {
    client_id: CONFIG.clientId,
    scope: SCOPES,
    callback: onToken,
  };
  if (silent) {
    // prompt: '' = solicitar token sin popup si ya se otorgó consentimiento.
    config.prompt = '';
    config.error_callback = () => {
      localStorage.removeItem('grungetab-authed');
      showScreen('login');
    };
  } else if (loginHint) {
    // Evitar el segundo selector de cuenta: el usuario ya eligió cuenta en GIS.
    config.hint = loginHint;
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

function renderQuickAccess(pinIds) {
  if (searchInput.value.trim()) return '';

  const pins    = state.pins;
  const recents = state.recents;
  if (pins.length === 0 && recents.length === 0) return '';

  const icons = { doc: '📄', txt: '🎸', pdf: '📕', folder: '📁' };
  const itemHtml = (item) => {
    const pinned = pinIds.has(item.id);
    return `
      <div class="doc-item quick-item"
           data-id="${item.id}"
           data-name="${escapeHtml(item.name)}"
           data-type="${item.type}">
        <span class="doc-icon">${icons[item.type] || '📄'}</span>
        <div class="doc-info"><div class="doc-name">${escapeHtml(item.name)}</div></div>
        <button class="btn-pin${pinned ? ' pinned' : ''}"
                data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-type="${item.type}"
                title="${pinned ? 'Quitar pin' : 'Fijar'}">📌</button>
        <span class="doc-arrow">›</span>
      </div>`;
  };

  let html = '';
  if (pins.length > 0) {
    html += `<div class="quick-section"><div class="quick-section-header">Fijados</div>${pins.map(itemHtml).join('')}</div>`;
  }
  if (recents.length > 0) {
    html += `<div class="quick-section"><div class="quick-section-header">Recientes</div>${recents.map(itemHtml).join('')}</div>`;
  }
  return html;
}

function renderItems(items) {
  const pinIds = new Set(state.pins.map(p => p.id));

  let html = renderQuickAccess(pinIds);

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
          ${pinBtn}
          <span class="doc-arrow">›</span>
        </div>`;
    }).join('');
    docList.innerHTML = html;
  }

  docList.querySelectorAll('.doc-item').forEach(el => {
    const pinBtn = el.querySelector('.btn-pin');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePin({ id: pinBtn.dataset.id, name: pinBtn.dataset.name, type: pinBtn.dataset.type });
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
  } catch (err) {
    const cached = await loadOffline('doc', docId);
    if (cached) {
      const doc = await cached.json();
      state.currentDoc = doc;
      tabContent.innerHTML = `<div class="doc-rendered">${renderGoogleDoc(doc)}</div>`;
      resolveOfflineImages(tabContent, docId);
      fileTypeBadge.textContent = 'DOC · OFFLINE';
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

  try {
    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveOffline('txt', fileId, res);
    const text = await res.text();
    tabContent.innerHTML = `<pre class="txt-rendered">${escapeHtml(text)}</pre>`;
  } catch (err) {
    const cached = await loadOffline('txt', fileId);
    if (cached) {
      const text = await cached.text();
      tabContent.innerHTML = `<pre class="txt-rendered">${escapeHtml(text)}</pre>`;
      fileTypeBadge.textContent = 'TXT · OFFLINE';
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
  zoomControl.classList.toggle('hidden', !isPdf);
  btnWrap.classList.toggle('hidden', isPdf);
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
  } catch (err) {
    try {
      await loadPdfJs();
      const cached = await loadOffline('pdf', fileId);
      if (cached) {
        const data = await cached.arrayBuffer();
        state.pdfDoc = await pdfjsLib.getDocument({ data }).promise;
        await renderPdfPages();
        fileTypeBadge.textContent = 'PDF · OFFLINE';
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
const OFFLINE_CACHE = 'grungetab-offline-files';

function offlineKey(type, id) {
  return `/offline/${type}/${encodeURIComponent(id)}`;
}

async function saveOffline(type, id, response) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put(offlineKey(type, id), response.clone());
  } catch {
    // quota exceeded, modo incógnito, etc. — silencioso
  }
}

async function loadOffline(type, id) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    return await cache.match(offlineKey(type, id));
  } catch {
    return null;
  }
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
    pause();
    return;
  }

  state.rafId = requestAnimationFrame(scrollStep);
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
btnSettings.addEventListener('click',  (e) => {
  e.stopPropagation();
  const open = settingsPanel.classList.toggle('hidden') === false;
  btnSettings.classList.toggle('active', open);
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
      applyFontSize(Math.min(4, state.fontSize + 1));
      showControls();
      scheduleHide();
      break;
    case '-':
      applyFontSize(Math.max(1, state.fontSize - 1));
      showControls();
      scheduleHide();
      break;
    case 'Escape':
      history.back();
      break;
  }
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