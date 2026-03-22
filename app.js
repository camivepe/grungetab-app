/* ── GrungeTab · app.js · Fase 2 ── */

// ── Configuración ────────────────────────────────────────────────────────────
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
].join(' ');

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

  // Lista
  allDocs: [],
};

// ── Velocidades ───────────────────────────────────────────────────────────────
const SPEED_LABELS = { 1: 'Lento', 2: 'Normal', 3: 'Rápido', 4: 'Muy rápido' };
const SPEEDS = {
  1: 8,
  2: 22,
  3: 40,
  4: 80,
};

function pxPerSecond(level) {
  return SPEEDS[level] ?? 22;
}

// ── Referencias DOM ───────────────────────────────────────────────────────────
const screenLogin  = document.getElementById('screen-login');
const screenList   = document.getElementById('screen-list');
const screenReader = document.getElementById('screen-reader');

const docList      = document.getElementById('doc-list');
const searchInput  = document.getElementById('search-input');

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

// ── Auth: Google Identity Services ────────────────────────────────────────────
// Llamado automáticamente por el botón de Google
window.onGoogleLogin = function(response) {
  // response.credential es un JWT de identidad — lo usamos para
  // obtener un access token con el flujo implícito
  initOAuthClient();
};

function initOAuthClient() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: document.getElementById('g_id_onload').dataset.clientId,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('OAuth error:', tokenResponse.error);
        return;
      }
      state.accessToken = tokenResponse.access_token;
      showScreen('list');
      loadDocList();
    },
  });
  client.requestAccessToken();
}

function logout() {
  state.accessToken = null;
  state.allDocs = [];
  docList.innerHTML = '<div id="list-loading">Cargando documentos...</div>';
  searchInput.value = '';
  pause();
  showScreen('login');
  // Revocar token en Google
  if (state.accessToken) {
    google.accounts.oauth2.revoke(state.accessToken);
  }
}

// ── Drive API: listar Google Docs ─────────────────────────────────────────────
async function loadDocList() {
  docList.innerHTML = '<div id="list-loading">Cargando documentos...</div>';

  try {
    // Traer todos los Google Docs del Drive (paginando si hay más de 100)
    let docs = [];
    let pageToken = null;

    do {
      const params = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.document' and '1r3OlkoFQYhetRq7tstXrl8dfOndvv0qx' in parents and trashed=false",
        fields: 'nextPageToken, files(id, name, modifiedTime)',
        orderBy: 'name',
        pageSize: 100,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await driveGet(`https://www.googleapis.com/drive/v3/files?${params}`);
      docs = docs.concat(res.files || []);
      pageToken = res.nextPageToken || null;
    } while (pageToken);

    state.allDocs = docs;
    renderDocList(docs);

  } catch (err) {
    docList.innerHTML = `<div id="list-error">Error cargando documentos.<br><small>${err.message}</small></div>`;
  }
}

function renderDocList(docs) {
  if (docs.length === 0) {
    docList.innerHTML = '<div id="list-loading">No se encontraron documentos.</div>';
    return;
  }

  docList.innerHTML = docs.map(doc => {
    const date = new Date(doc.modifiedTime).toLocaleDateString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    return `
      <div class="doc-item" data-id="${doc.id}" data-name="${escapeHtml(doc.name)}">
        <span class="doc-icon">📄</span>
        <div class="doc-info">
          <div class="doc-name">${escapeHtml(doc.name)}</div>
          <div class="doc-date">Modificado: ${date}</div>
        </div>
        <span class="doc-arrow">›</span>
      </div>
    `;
  }).join('');

  // Click en cada item
  docList.querySelectorAll('.doc-item').forEach(item => {
    item.addEventListener('click', () => {
      openDoc(item.dataset.id, item.dataset.name);
    });
  });
}

// ── Búsqueda ──────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
      ? state.allDocs.filter(d => d.name.toLowerCase().includes(q))
      : state.allDocs;
  renderDocList(filtered);
});


function renderGoogleDoc(doc) {
  if (!doc.body || !doc.body.content) return '<p>Documento vacío.</p>';

  let html = '';

  for (const block of doc.body.content) {
    if (block.paragraph) {
      html += renderParagraph(block.paragraph);
    } else if (block.table) {
      html += renderTable(block.table);
    }
  }

  return html;
}

function renderParagraph(para) {
  if (!para.elements) return '';

  let line = '';
  for (const el of para.elements) {
    if (el.textRun) {
      const text = escapeHtml(el.textRun.content || '');
      const style = el.textRun.textStyle || {};
      let span = text;
      if (style.bold)   span = `<strong>${span}</strong>`;
      if (style.italic) span = `<em>${span}</em>`;
      line += span;
    } else if (el.inlineObjectElement) {
      const objId = el.inlineObjectElement.inlineObjectId;
      const obj = doc_current?.inlineObjects?.[objId];
      if (obj) {
        const props = obj.inlineObjectProperties?.embeddedObject;
        if (props?.imageProperties?.contentUri) {
          line += `<img src="${props.imageProperties.contentUri}" alt="imagen" />`;
        }
      }
    }
  }

  // Detectar estilo de párrafo
  const style = para.paragraphStyle?.namedStyleType || '';
  if (style.startsWith('HEADING')) {
    const level = style.replace('HEADING_', '') || '2';
    return `<h${level}>${line}</h${level}>\n`;
  }

  return `<p>${line}</p>\n`;
}

function renderTable(table) {
  let html = '<table style="border-collapse:collapse;margin:8px 0;">';
  for (const row of (table.tableRows || [])) {
    html += '<tr>';
    for (const cell of (row.tableCells || [])) {
      let cellContent = '';
      for (const block of (cell.content || [])) {
        if (block.paragraph) cellContent += renderParagraph(block.paragraph);
      }
      html += `<td style="border:0.5px solid rgba(128,128,128,.3);padding:4px 8px;">${cellContent}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>\n';
  return html;
}

// Variable para acceder al doc actual desde renderParagraph (imágenes)
let doc_current = null;

async function openDoc(docId, docName) {
  songTitle.textContent = docName;
  tabContent.innerHTML = '<p style="padding:16px;opacity:.5">Cargando...</p>';
  showScreen('reader');
  container.scrollTop = 0;
  pause();

  try {
    const doc = await driveGet(
        `https://docs.googleapis.com/v1/documents/${docId}`
    );
    doc_current = doc;
    const html = renderGoogleDoc(doc);
    tabContent.innerHTML = `<div class="doc-rendered">${html}</div>`;
  } catch (err) {
    tabContent.innerHTML = `<p style="padding:16px;color:#e57373">Error cargando el documento.<br><small>${err.message}</small></p>`;
  }
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
btnBack.addEventListener('click', () => { pause(); showScreen('list'); });
btnTop.addEventListener('click',  (e) => { e.stopPropagation(); pause(); container.scrollTo({ top: 0, behavior: 'smooth' }); });
btnTheme.addEventListener('click',     (e) => { e.stopPropagation(); toggleTheme(); });
btnListTheme.addEventListener('click', (e) => { e.stopPropagation(); toggleTheme(); });
btnLogout.addEventListener('click',    (e) => { e.stopPropagation(); logout(); });

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

// ── Service Worker (solo en producción) ──────────────────────────────────────
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadTheme();
speedLabel.textContent = SPEED_LABELS[state.speed];
speedSlider.value = state.speed;
showScreen('login');
