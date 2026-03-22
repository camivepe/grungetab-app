/* ── GrungeTab · app.js ── */

// ── Estado ──────────────────────────────────────────────────────────────────
const state = {
  playing: false,
  speed: 2,           // 1–4
  theme: 'dark',
  hideTimer: null,
  rafId: null,
  lastTimestamp: null,
  scrollAccum: 0,     // acumulador de píxeles fraccionarios
};

const SPEED_LABELS = { 1: 'Lento', 2: 'Normal', 3: 'Rápido', 4: 'Muy rápido' };
const SPEEDS = {
  1: 8,   // Lento — cómodo para leer sin apuro
  2: 22,   // Normal — ritmo de lectura estándar
  3: 40,   // Rápido
  4: 80,  // Muy rápido
};

function pxPerSecond(level) {
  return SPEEDS[level] ?? 35;
}

// ── Referencias DOM ─────────────────────────────────────────────────────────
const container  = document.getElementById('tab-container');
const controls   = document.getElementById('controls');
const btnPlay    = document.getElementById('btn-play');
const btnTop     = document.getElementById('btn-top');
const btnTheme   = document.getElementById('btn-theme');
const speedSlider = document.getElementById('speed-slider');
const speedLabel = document.getElementById('speed-label');

// ── Scroll automático (requestAnimationFrame) ────────────────────────────────
function scrollStep(timestamp) {
  if (!state.playing) return;

  if (state.lastTimestamp === null) {
    state.lastTimestamp = timestamp;
    state.rafId = requestAnimationFrame(scrollStep);
    return;
  }

  const elapsed = (timestamp - state.lastTimestamp) / 1000;
  state.lastTimestamp = timestamp;

  // Acumular píxeles fraccionarios para no perder movimiento en velocidades bajas
  state.scrollAccum += pxPerSecond(state.speed) * elapsed;

  if (state.scrollAccum >= 1) {
    const pxToApply = Math.floor(state.scrollAccum);
    state.scrollAccum -= pxToApply;
    container.scrollTop += pxToApply;
  }

  // Detectar si llegamos al final
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

// ── Visibilidad de controles ─────────────────────────────────────────────────
function showControls() {
  controls.classList.remove('hidden');
  clearTimeout(state.hideTimer);
}

function scheduleHide() {
  clearTimeout(state.hideTimer);
  if (state.playing) {
    state.hideTimer = setTimeout(() => {
      controls.classList.add('hidden');
    }, 3000);
  }
}

// ── Tema oscuro / claro ──────────────────────────────────────────────────────
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.classList.toggle('dark', state.theme === 'dark');
  document.body.classList.toggle('light', state.theme === 'light');
  btnTheme.textContent = state.theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('grungetab-theme', state.theme);
}

function loadTheme() {
  const saved = localStorage.getItem('grungetab-theme') || 'dark';
  state.theme = saved;
  document.body.classList.add(saved);
  btnTheme.textContent = saved === 'dark' ? '☀️' : '🌙';
}

// ── Volver al inicio ─────────────────────────────────────────────────────────
function scrollToTop() {
  pause();
  container.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Event listeners ──────────────────────────────────────────────────────────

// Play / pausa con botón
btnPlay.addEventListener('click', togglePlay);

// Tap en el área de la tablatura = mostrar controles / toggle play
container.addEventListener('click', (e) => {
  if (controls.classList.contains('hidden')) {
    showControls();
    scheduleHide();
  } else {
    togglePlay();
  }
});

// Volver arriba
btnTop.addEventListener('click', (e) => {
  e.stopPropagation();
  scrollToTop();
});

// Toggle tema
btnTheme.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleTheme();
});

// Velocidad
speedSlider.addEventListener('input', () => {
  state.speed = parseInt(speedSlider.value, 10);
  speedLabel.textContent = SPEED_LABELS[state.speed];
  state.lastTimestamp = null;
  state.scrollAccum = 0;
  showControls();
  scheduleHide();
});

// Mostrar controles al tocar la pantalla mientras están ocultos
document.addEventListener('touchstart', () => {
  if (controls.classList.contains('hidden')) {
    showControls();
    scheduleHide();
  }
}, { passive: true });

// ── Service Worker ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registrado:', reg.scope))
        .catch(err => console.warn('SW error:', err));
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
loadTheme();
speedLabel.textContent = SPEED_LABELS[state.speed];
speedSlider.value = state.speed;
