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
function saveRecents(arr) { localStorage.setItem('grungetab-recents', JSON.stringify(arr)); }
function addRecent(item) {
  const r = loadRecents().filter(x => x.id !== item.id);
  r.unshift(item);
  saveRecents(r.slice(0, RECENTS_MAX));
}

function loadPins() {
  try { return JSON.parse(localStorage.getItem('grungetab-pins') || '[]'); }
  catch { return []; }
}
function savePins(arr) { localStorage.setItem('grungetab-pins', JSON.stringify(arr)); }
function togglePin(item) {
  const pins = loadPins();
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

function renderQuickAccess(pinIds) {
  if (searchInput.value.trim()) return '';

  const pins    = loadPins();
  const recents = loadRecents();
  if (pins.length === 0 && recents.length === 0) return '';

  const icons = { doc: '📄', txt: '🎸', pdf: '📕' };
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
  const pins   = loadPins();
  const pinIds = new Set(pins.map(p => p.id));

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
      const pinBtn = isFolder ? '' : `<button class="btn-pin${pinIds.has(item.id) ? ' pinned' : ''}"
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

// ── Búsqueda ──────────────────────────────────────────────────────────────────
function applySearch() {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? state.allItems.filter(d => d.name.toLowerCase().includes(q))
    : state.allItems;
  renderItems(filtered);
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
      const obj   = doc_current?.inlineObjects?.[objId];
      if (obj) {
        const props = obj.inlineObjectProperties?.embeddedObject;
        // contentUri = imagen hosteada por Google (requiere auth).
        // sourceUri  = URL original de donde se insertó (pública, no necesita auth).
        const src = props?.imageProperties?.contentUri
                 || props?.imageProperties?.sourceUri;
        if (src) {
          line += `<img src="${src}" alt="imagen" data-original-src="${src}" />`;
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
  state.currentFile = { id: docId, name: docName, type: 'doc' };
  addRecent({ id: docId, name: docName, type: 'doc' });
  songTitle.textContent     = docName;
  fileTypeBadge.textContent = 'DOC';
  tabContent.innerHTML      = '<p style="padding:16px;opacity:.5">Cargando...</p>';
  setFileTypeControls('doc');
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

async function openTxt(fileId, fileName) {
  state.currentFile = { id: fileId, name: fileName, type: 'txt' };
  addRecent({ id: fileId, name: fileName, type: 'txt' });
  songTitle.textContent     = fileName;
  fileTypeBadge.textContent = 'TXT';
  tabContent.innerHTML      = '<p style="padding:16px;opacity:.5">Cargando...</p>';
  setFileTypeControls('txt');
  showScreen('reader');
  container.scrollTop = 0;
  pause();

  try {
    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    tabContent.innerHTML = `<pre class="txt-rendered">${escapeHtml(text)}</pre>`;
  } catch (err) {
    tabContent.innerHTML = `<p style="padding:16px;color:#e57373">Error cargando el archivo.<br><small>${err.message}</small></p>`;
  }
}

// ── PDF viewer ────────────────────────────────────────────────────────────────
const PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDFJS_SRI    = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src               = PDFJS_CDN;
    script.integrity         = PDFJS_SRI;
    script.crossOrigin       = 'anonymous';
    script.referrerPolicy    = 'no-referrer';
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve();
    };
    script.onerror = () => reject(new Error('No se pudo cargar PDF.js'));
    document.head.appendChild(script);
  });
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

// Renderiza todas las páginas del PDF almacenado en state.pdfDoc
async function renderPdfPages() {
  const pdf = state.pdfDoc;
  const prevScrollTop = container.scrollTop;

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-rendered';
  tabContent.innerHTML = '';
  tabContent.appendChild(wrapper);

  const baseW = tabContent.clientWidth || (container.clientWidth - 32);

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page      = await pdf.getPage(pageNum);
    const naturalVp = page.getViewport({ scale: 1 });
    const scale     = (baseW / naturalVp.width) * state.pdfScale;
    const viewport  = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    // Ancho fijo en px para que el zoom > 1 desborde y genere scroll horizontal
    canvas.style.cssText = `width:${viewport.width}px;max-width:none;display:block;margin-bottom:${pageNum < pdf.numPages ? '8' : '120'}px;`;

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    wrapper.appendChild(canvas);
  }

  container.scrollTop = prevScrollTop;
}

let pdfZoomDebounce = null;

async function setPdfZoom(delta) {
  if (!state.pdfDoc) return;
  state.pdfScale = Math.max(0.5, Math.min(3.0, state.pdfScale + delta));
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
  showScreen('reader');
  container.scrollTop = 0;
  pause();
  setFileTypeControls('pdf');
  state.pdfScale = 1.0;
  updateZoomLabel();

  try {
    await loadPdfJs();

    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.arrayBuffer();

    state.pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    await renderPdfPages();
  } catch (err) {
    state.pdfDoc = null;
    tabContent.innerHTML = `<p style="padding:16px;color:#e57373">Error cargando el PDF.<br><small>${err.message}</small></p>`;
  }
}

// ── Imágenes de Google Docs ───────────────────────────────────────────────────
// Los contentUri de la Docs API ya llevan autenticación en el parámetro ?key=,
// por lo que los <img> los cargan directamente sin fetch adicional.
// fetch() con Authorization header falla por CORS en lh*.googleusercontent.com.
// Si la imagen no carga por onerror, intentamos agregar el access_token como
// query param (último recurso para URLs que requieran auth explícita).
function resolveAuthImages(container) {
  container.querySelectorAll('img[data-original-src]').forEach(img => {
    img.onerror = () => {
      const url = new URL(img.dataset.originalSrc);
      url.searchParams.set('access_token', state.accessToken);
      img.onerror = null; // evitar loop infinito
      img.src = url.toString();
    };
  });
}

// ── Helper: renovar token OAuth silenciosamente ───────────────────────────────
function refreshToken() {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id:      CONFIG.clientId,
      scope:          SCOPES,
      prompt:         '',
      callback:       (r) => r.error ? reject(new Error(r.error)) : (state.accessToken = r.access_token, resolve()),
      error_callback: (e) => reject(new Error(e?.type || 'token_error')),
    });
    client.requestAccessToken();
  });
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
btnBack.addEventListener('click',     ()  => { pause(); showScreen('list'); });
btnReload?.addEventListener('click',  (e) => { e.stopPropagation(); reloadCurrentFile(); showControls(); });
btnTop.addEventListener('click',      (e) => { e.stopPropagation(); pause(); container.scrollTo({ top: 0, behavior: 'smooth' }); });
btnTheme.addEventListener('click',    (e) => { e.stopPropagation(); toggleTheme(); });
btnListTheme.addEventListener('click',(e) => { e.stopPropagation(); toggleTheme(); });
btnLogout.addEventListener('click',   (e) => { e.stopPropagation(); logout(); });
btnListBack.addEventListener('click', (e) => { e.stopPropagation(); navigateUp(); });
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